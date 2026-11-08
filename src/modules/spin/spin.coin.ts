import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { InputFile, type Api } from "grammy";
import type { Message } from "grammy/types";
import { prisma } from "../../shared/lib/prisma.js";
import type { CoinSide } from "./spin.service.js";

export const COIN_ANIMATION_MS = 2_500;

const FILE_NAMES: Record<CoinSide, string> = { Heads: "coin-heads.gif", Tails: "coin-tails.gif" };
const FILE_ID_KEYS: Record<CoinSide, string> = { Heads: "coin_heads_file_id", Tails: "coin_tails_file_id" };

async function cachedFileId(side: CoinSide): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: FILE_ID_KEYS[side] } });
  return setting?.value ?? null;
}

async function saveFileId(side: CoinSide, fileId: string): Promise<void> {
  const key = FILE_ID_KEYS[side];
  await prisma.setting.upsert({ where: { key }, create: { key, value: fileId }, update: { value: fileId } });
}

export async function sendCoinAnimation(
  api: Api,
  chatId: number,
  side: CoinSide,
  caption: string,
): Promise<Message.AnimationMessage> {
  const options = { caption, parse_mode: "HTML" } as const;
  const fileId = await cachedFileId(side);
  if (fileId) {
    const sent = await api.sendAnimation(chatId, fileId, options).catch(() => null);
    if (sent) {
      return sent;
    }
  }

  const name = FILE_NAMES[side];
  const file = await readFile(join(process.cwd(), "assets", name));
  const sent = await api.sendAnimation(chatId, new InputFile(file, name), options);
  await saveFileId(side, sent.animation.file_id).catch(() => undefined);
  return sent;
}
