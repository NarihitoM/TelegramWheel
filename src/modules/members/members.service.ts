import { Prisma } from "@prisma/client";
import type { Api } from "grammy";
import type { User } from "grammy/types";
import { prisma } from "../../shared/lib/prisma.js";
import type { Member } from "../spin/spin.types.js";

export function toMember(user: User): Member {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return {
    id: String(user.id),
    name: name || user.username || `User ${user.id}`,
    username: user.username,
  };
}

function isMissingChat(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

export async function rememberMembers(chatId: number, users: User[]): Promise<boolean> {
  const members = users.filter((user) => !user.is_bot).map(toMember);
  if (members.length === 0) {
    return true;
  }

  try {
    await prisma.$transaction(
      members.map((member) =>
        prisma.knownMember.upsert({
          where: { chatId_userId: { chatId: BigInt(chatId), userId: BigInt(member.id) } },
          create: { chatId: BigInt(chatId), userId: BigInt(member.id), name: member.name, username: member.username },
          update: { name: member.name, username: member.username ?? null },
        }),
      ),
    );
    return true;
  } catch (error) {
    if (isMissingChat(error)) {
      return false;
    }
    throw error;
  }
}

export async function forgetMember(chatId: number, userId: number): Promise<void> {
  await prisma.knownMember.deleteMany({ where: { chatId: BigInt(chatId), userId: BigInt(userId) } });
}

export async function listKnownMembers(chatId: number): Promise<Member[]> {
  const members = await prisma.knownMember.findMany({
    where: { chatId: BigInt(chatId) },
    orderBy: { name: "asc" },
  });
  return members.map((member) => ({
    id: member.userId.toString(),
    name: member.name,
    username: member.username ?? undefined,
  }));
}

export async function syncAdmins(api: Api, chatId: number): Promise<void> {
  const admins = await api.getChatAdministrators(chatId).catch(() => []);
  await rememberMembers(
    chatId,
    admins.map((admin) => admin.user),
  );
}
