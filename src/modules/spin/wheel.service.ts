import { prisma } from "../../shared/lib/prisma.js";
import type { Member } from "./spin.types.js";

export type WheelStep =
  | "joining"
  | "teamCount"
  | "teamSize"
  | "customTeamCount"
  | "customTeamSize"
  | "confirm"
  | "done"
  | "cancelled";

export const OPEN_STEPS: WheelStep[] = ["joining", "teamCount", "teamSize", "customTeamCount", "customTeamSize", "confirm"];
export const CUSTOM_STEPS: WheelStep[] = ["customTeamCount", "customTeamSize"];

export interface Wheel {
  id: number;
  chatId: number;
  messageId: number | null;
  ownerId: number;
  ownerName: string;
  step: WheelStep;
  teamCount: number | null;
  teamSize: number | null;
  members: Member[];
}

const withMembers = { members: { orderBy: { joinedAt: "asc" } } } as const;

function findRow(id: number) {
  return prisma.wheel.findUnique({ where: { id }, include: withMembers });
}

type WheelRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function toWheel(row: WheelRow): Wheel {
  return {
    id: row.id,
    chatId: Number(row.chatId),
    messageId: row.messageId,
    ownerId: Number(row.ownerId),
    ownerName: row.ownerName,
    step: row.step as WheelStep,
    teamCount: row.teamCount,
    teamSize: row.teamSize,
    members: row.members.map((member) => ({
      id: member.userId.toString(),
      name: member.name,
      username: member.username ?? undefined,
    })),
  };
}

export async function createWheel(chatId: number, owner: Member, members: Member[]): Promise<Wheel> {
  await prisma.wheel.updateMany({
    where: { chatId: BigInt(chatId), ownerId: BigInt(owner.id), step: { in: OPEN_STEPS } },
    data: { step: "cancelled" },
  });

  const unique = new Map(members.map((member) => [member.id, member]));
  const row = await prisma.wheel.create({
    data: {
      chatId: BigInt(chatId),
      ownerId: BigInt(owner.id),
      ownerName: owner.name,
      step: "joining",
      members: {
        create: [...unique.values()].map((member) => ({
          userId: BigInt(member.id),
          name: member.name,
          username: member.username,
        })),
      },
    },
    include: withMembers,
  });
  return toWheel(row);
}

export async function getWheel(id: number): Promise<Wheel | null> {
  const row = await findRow(id);
  return row ? toWheel(row) : null;
}

export async function setWheelMessage(id: number, messageId: number): Promise<void> {
  await prisma.wheel.update({ where: { id }, data: { messageId } });
}

export async function addWheelMember(wheelId: number, member: Member): Promise<boolean> {
  const { count } = await prisma.wheelMember.createMany({
    data: [{ wheelId, userId: BigInt(member.id), name: member.name, username: member.username }],
    skipDuplicates: true,
  });
  return count > 0;
}

export async function removeWheelMember(wheelId: number, userId: number): Promise<boolean> {
  const { count } = await prisma.wheelMember.deleteMany({ where: { wheelId, userId: BigInt(userId) } });
  return count > 0;
}

export async function moveWheel(
  id: number,
  from: WheelStep[],
  data: { step: WheelStep; teamCount?: number | null; teamSize?: number | null },
): Promise<boolean> {
  const { count } = await prisma.wheel.updateMany({ where: { id, step: { in: from } }, data });
  return count > 0;
}

export async function findWheelAwaitingInput(ownerId: number, chatId: number | null): Promise<Wheel | null> {
  const row = await prisma.wheel.findFirst({
    where: {
      ownerId: BigInt(ownerId),
      step: { in: CUSTOM_STEPS },
      ...(chatId === null ? {} : { chatId: BigInt(chatId) }),
    },
    orderBy: { updatedAt: "desc" },
    include: withMembers,
  });
  return row ? toWheel(row) : null;
}
