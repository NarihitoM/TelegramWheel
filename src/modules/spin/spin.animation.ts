import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { InputFile, type Api } from "grammy";
import type { Message } from "grammy/types";
import { prisma } from "../../shared/lib/prisma.js";
import type { CoinSide } from "./spin.service.js";

export type AnimationName = "wheel" | "loading";

export const COIN_ANIMATION_MS = 2_200;

const COIN_FILES: Record<CoinSide, string> = { Heads: "coin-heads", Tails: "coin-tails" };

function fileIdKey(fileName: string): string {
  return `asset_${fileName}_file_id`;
}

async function cachedFileId(fileName: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: fileIdKey(fileName) } });
  return setting?.value ?? null;
}

async function saveFileId(fileName: string, fileId: string): Promise<void> {
  const key = fileIdKey(fileName);
  await prisma.setting.upsert({ where: { key }, create: { key, value: fileId }, update: { value: fileId } });
}

async function loadAsset(fileName: string): Promise<InputFile> {
  return new InputFile(await readFile(join(process.cwd(), "assets", fileName)), fileName);
}

async function sendAsset<T>(
  fileName: string,
  send: (file: string | InputFile) => Promise<T>,
  fileIdOf: (message: T) => string,
): Promise<T> {
  const fileId = await cachedFileId(fileName);
  if (fileId) {
    const sent = await send(fileId).catch(() => null);
    if (sent) {
      return sent;
    }
  }

  const sent = await send(await loadAsset(fileName));
  await saveFileId(fileName, fileIdOf(sent)).catch(() => undefined);
  return sent;
}

export function sendCoinSticker(
  api: Api,
  chatId: number,
  side: CoinSide,
  animated: boolean,
): Promise<Message.StickerMessage> {
  return sendAsset(
    `${COIN_FILES[side]}.${animated ? "tgs" : "webp"}`,
    (file) => api.sendSticker(chatId, file),
    (message) => message.sticker.file_id,
  );
}

export async function showLoading(api: Api, chatId: number, name: AnimationName): Promise<() => Promise<void>> {
  const sent = await sendAsset(
    `${name}.tgs`,
    (file) => api.sendSticker(chatId, file),
    (message) => message.sticker.file_id,
  ).catch((error: unknown) => {
    console.error(`Failed to send ${name} sticker:`, error);
    return null;
  });
  return async () => {
    if (sent) {
      await api.deleteMessage(chatId, sent.message_id).catch(() => undefined);
    }
  };
}
