import { prisma } from "../../shared/lib/prisma.js";
import type { Member } from "./spin.types.js";

export type WheelMode = "split" | "winner";

export type WheelStep =
  | "mode"
  | "joining"
  | "teamCount"
  | "teamSize"
  | "customTeamCount"
  | "customTeamSize"
  | "winnerCount"
  | "customWinnerCount"
  | "confirm"
  | "done"
  | "cancelled";

export const OPEN_STEPS: WheelStep[] = [
  "mode",
  "joining",
  "teamCount",
  "teamSize",
  "customTeamCount",
  "customTeamSize",
  "winnerCount",
  "customWinnerCount",
  "confirm",
];
export const CUSTOM_STEPS: WheelStep[] = ["customTeamCount", "customTeamSize", "customWinnerCount"];

export interface Wheel {
  id: number;
  chatId: number;
  messageId: number | null;
  ownerId: number;
  ownerName: string;
  step: WheelStep;
  mode: WheelMode;
  teamCount: number | null;
  teamSize: number | null;
  updatedAt: Date;
  members: Member[];
}

export const WHEEL_EXPIRY_MS = 10 * 60_000;

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
    mode: row.mode === "winner" ? "winner" : "split",
    teamCount: row.teamCount,
    teamSize: row.teamSize,
    updatedAt: row.updatedAt,
    members: row.members.map((member) => ({
      id: member.userId.toString(),
      name: member.name,
      username: member.username ?? undefined,
    })),
  };
}

export async function findOpenWheel(chatId: number): Promise<Wheel | null> {
  const row = await prisma.wheel.findFirst({
    where: {
      chatId: BigInt(chatId),
      step: { in: OPEN_STEPS },
      updatedAt: { gt: new Date(Date.now() - WHEEL_EXPIRY_MS) },
    },
    orderBy: { updatedAt: "desc" },
    include: withMembers,
  });
  return row ? toWheel(row) : null;
}

export async function createWheel(
  chatId: number,
  owner: Member,
  members: Member[],
  options: { mode?: WheelMode; step?: WheelStep } = {},
): Promise<Wheel> {
  await prisma.wheel.updateMany({
    where: { chatId: BigInt(chatId), step: { in: OPEN_STEPS } },
    data: { step: "cancelled" },
  });

  const unique = new Map(members.map((member) => [member.id, member]));
  const row = await prisma.wheel.create({
    data: {
      chatId: BigInt(chatId),
      ownerId: BigInt(owner.id),
      ownerName: owner.name,
      step: options.step ?? "joining",
      mode: options.mode ?? "split",
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

async function touchWheel(wheelId: number): Promise<void> {
  await prisma.wheel.update({ where: { id: wheelId }, data: { updatedAt: new Date() } });
}

export async function addWheelMember(wheelId: number, member: Member): Promise<boolean> {
  const { count } = await prisma.wheelMember.createMany({
    data: [{ wheelId, userId: BigInt(member.id), name: member.name, username: member.username }],
    skipDuplicates: true,
  });
  if (count > 0) {
    await touchWheel(wheelId);
  }
  return count > 0;
}

export async function removeWheelMember(wheelId: number, userId: number): Promise<boolean> {
  const { count } = await prisma.wheelMember.deleteMany({ where: { wheelId, userId: BigInt(userId) } });
  if (count > 0) {
    await touchWheel(wheelId);
  }
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
