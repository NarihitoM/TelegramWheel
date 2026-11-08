import type { Chat } from "grammy/types";
import { prisma } from "../../shared/lib/prisma.js";

export const WHEEL_COOLDOWN_MS = 10_000;

type GroupChat = Exclude<Chat, Chat.PrivateChat>;

export function isGroupChat(chat: Chat): chat is GroupChat {
  return chat.type !== "private";
}

export async function saveChat(chat: GroupChat, addedById?: number): Promise<void> {
  await prisma.chat.upsert({
    where: { id: BigInt(chat.id) },
    create: {
      id: BigInt(chat.id),
      title: chat.title,
      type: chat.type,
      addedById: addedById === undefined ? null : BigInt(addedById),
    },
    update: { title: chat.title, type: chat.type, active: true },
  });
}

export async function deactivateChat(chatId: number): Promise<void> {
  await prisma.chat.updateMany({ where: { id: BigInt(chatId) }, data: { active: false } });
}

export async function listActiveChannels(limit: number): Promise<{ id: number; title: string }[]> {
  const chats = await prisma.chat.findMany({
    where: { active: true, type: "channel" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { id: true, title: true },
  });
  return chats.map((chat) => ({ id: Number(chat.id), title: chat.title }));
}

export async function claimWheelCooldown(chatId: number): Promise<number> {
  const now = new Date();
  const threshold = new Date(now.getTime() - WHEEL_COOLDOWN_MS);
  const { count } = await prisma.chat.updateMany({
    where: {
      id: BigInt(chatId),
      OR: [{ lastWheelAt: null }, { lastWheelAt: { lt: threshold } }],
    },
    data: { lastWheelAt: now },
  });
  if (count > 0) {
    return 0;
  }

  const chat = await prisma.chat.findUnique({ where: { id: BigInt(chatId) }, select: { lastWheelAt: true } });
  const last = chat?.lastWheelAt?.getTime() ?? 0;
  return Math.max(1, Math.ceil((last + WHEEL_COOLDOWN_MS - now.getTime()) / 1000));
}
