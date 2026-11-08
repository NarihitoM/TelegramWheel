import type { Api } from "grammy";
import { env } from "../../shared/config/env.js";
import { prisma } from "../../shared/lib/prisma.js";
import type { Member } from "../spin/spin.types.js";

export type AvatarMap = Map<string, string>;

const REFRESH_AFTER_MS = 3 * 24 * 60 * 60_000;
const BATCH_SIZE = 10;
const DOWNLOAD_TIMEOUT_MS = 4_000;

function toDataUri(data: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(data).toString("base64")}`;
}

export async function getStoredAvatars(members: Member[]): Promise<AvatarMap> {
  const ids = [...new Set(members.map((member) => BigInt(member.id)))];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await prisma.avatar.findMany({ where: { userId: { in: ids }, data: { not: null } } });
  return new Map(rows.flatMap((row) => (row.data ? [[row.userId.toString(), toDataUri(row.data)] as const] : [])));
}

async function download(filePath: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const response = await fetch(`https://api.telegram.org/file/bot${env.botToken}/${filePath}`, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

async function syncAvatar(api: Api, userId: bigint, storedPhotoId: string | null, hasRow: boolean): Promise<void> {
  const photos = await api.getUserProfilePhotos(Number(userId), { limit: 1 });
  const smallest = photos.photos[0]?.[0] ?? null;
  const photoId = smallest?.file_unique_id ?? null;

  if (hasRow && photoId === storedPhotoId) {
    await prisma.avatar.update({ where: { userId }, data: { updatedAt: new Date() } });
    return;
  }

  let data: Uint8Array<ArrayBuffer> | null = null;
  if (smallest) {
    const file = await api.getFile(smallest.file_id);
    data = file.file_path ? await download(file.file_path) : null;
  }
  await prisma.avatar.upsert({
    where: { userId },
    create: { userId, photoId, data },
    update: { photoId, data },
  });
}

export async function syncAvatars(api: Api, members: Member[], budgetMs: number): Promise<void> {
  const started = Date.now();
  const ids = [...new Set(members.map((member) => BigInt(member.id)))];
  if (ids.length === 0) {
    return;
  }

  const rows = await prisma.avatar.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, photoId: true, updatedAt: true },
  });
  const stored = new Map(rows.map((row) => [row.userId, row]));
  const staleBefore = Date.now() - REFRESH_AFTER_MS;
  const pending = ids.filter((id) => {
    const row = stored.get(id);
    return !row || row.updatedAt.getTime() < staleBefore;
  });

  for (let start = 0; start < pending.length && Date.now() - started < budgetMs; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE);
    await Promise.all(
      batch.map((userId) => {
        const row = stored.get(userId);
        return syncAvatar(api, userId, row?.photoId ?? null, row !== undefined).catch(() => undefined);
      }),
    );
  }
}
