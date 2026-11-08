import type { Api as BotApi } from "grammy";
import { Api, type TelegramClient } from "telegram";
import { env } from "../../shared/config/env.js";
import { isMtprotoEnabled, withBotClient } from "../../shared/lib/mtproto.js";
import { prisma } from "../../shared/lib/prisma.js";
import type { Member } from "../spin/spin.types.js";

export type AvatarMap = Map<string, string>;

const MAX_CHAT_AVATARS = 1000;
const BATCH_SIZE = 10;
const DOWNLOAD_TIMEOUT_MS = 4_000;

function toDataUri(data: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(data).toString("base64")}`;
}

async function saveAvatar(userId: bigint, photoId: string | null, data: Uint8Array<ArrayBuffer> | null): Promise<void> {
  await prisma.avatar.upsert({
    where: { userId },
    create: { userId, photoId, data },
    update: { photoId, data },
  });
}

export async function getStoredAvatars(members: Member[]): Promise<AvatarMap> {
  const ids = [...new Set(members.map((member) => BigInt(member.id)))];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await prisma.avatar.findMany({ where: { userId: { in: ids }, data: { not: null } } });
  return new Map(rows.flatMap((row) => (row.data ? [[row.userId.toString(), toDataUri(row.data)] as const] : [])));
}

function mtprotoPhotoId(user: Api.User): string | null {
  return user.photo instanceof Api.UserProfilePhoto ? `mt:${user.photo.photoId.toString()}` : null;
}

async function saveMtprotoAvatar(client: TelegramClient, user: Api.User, photoId: string | null): Promise<void> {
  const userId = BigInt(user.id.toString());
  if (!photoId) {
    await saveAvatar(userId, null, null);
    return;
  }
  const downloaded = await client.downloadProfilePhoto(user, { isBig: false });
  await saveAvatar(userId, photoId, Buffer.isBuffer(downloaded) ? new Uint8Array(downloaded) : null);
}

export async function syncChatAvatars(chatId: number, budgetMs: number): Promise<void> {
  if (!isMtprotoEnabled()) {
    return;
  }
  const started = Date.now();

  await withBotClient(async (client) => {
    const entity = await client.getEntity(chatId);
    const users = (await client.getParticipants(entity, { limit: MAX_CHAT_AVATARS })).filter(
      (user) => !user.bot && !user.deleted,
    );
    const rows = await prisma.avatar.findMany({
      where: { userId: { in: users.map((user) => BigInt(user.id.toString())) } },
      select: { userId: true, photoId: true },
    });
    const stored = new Map(rows.map((row) => [row.userId.toString(), row.photoId]));
    const pending = users.filter((user) => {
      const id = user.id.toString();
      return !stored.has(id) || stored.get(id) !== mtprotoPhotoId(user);
    });

    for (let start = 0; start < pending.length && Date.now() - started < budgetMs; start += BATCH_SIZE) {
      const batch = pending.slice(start, start + BATCH_SIZE);
      await Promise.all(
        batch.map((user) => saveMtprotoAvatar(client, user, mtprotoPhotoId(user)).catch(() => undefined)),
      );
    }
  });
}

async function download(filePath: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const response = await fetch(`https://api.telegram.org/file/bot${env.botToken}/${filePath}`, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

async function saveBotApiAvatar(api: BotApi, userId: bigint): Promise<void> {
  const photos = await api.getUserProfilePhotos(Number(userId), { limit: 1 });
  const smallest = photos.photos[0]?.[0];
  if (!smallest) {
    await saveAvatar(userId, null, null);
    return;
  }
  const file = await api.getFile(smallest.file_id);
  await saveAvatar(userId, smallest.file_unique_id, file.file_path ? await download(file.file_path) : null);
}

export async function syncMissingAvatars(api: BotApi, members: Member[], budgetMs: number): Promise<void> {
  const started = Date.now();
  const ids = [...new Set(members.map((member) => BigInt(member.id)))];
  if (ids.length === 0) {
    return;
  }

  const rows = await prisma.avatar.findMany({ where: { userId: { in: ids } }, select: { userId: true } });
  const known = new Set(rows.map((row) => row.userId));
  const missing = ids.filter((id) => !known.has(id));

  for (let start = 0; start < missing.length && Date.now() - started < budgetMs; start += BATCH_SIZE) {
    const batch = missing.slice(start, start + BATCH_SIZE);
    await Promise.all(batch.map((userId) => saveBotApiAvatar(api, userId).catch(() => undefined)));
  }
}
