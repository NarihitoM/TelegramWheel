import { InlineKeyboard } from "grammy";

export const MAX_BUTTONS = 8;
const BUTTONS_PER_ROW = 4;

export type WheelAction = "tc" | "ts" | "cc" | "cs" | "go" | "back" | "x" | "pk";

export interface WheelCallback {
  ownerId: number;
  action: WheelAction;
  value?: number;
}

const ACTIONS: readonly WheelAction[] = ["tc", "ts", "cc", "cs", "go", "back", "x", "pk"];

export function encodeCallback({ ownerId, action, value }: WheelCallback): string {
  return value === undefined ? `w:${ownerId}:${action}` : `w:${ownerId}:${action}:${value}`;
}

export function decodeCallback(data: string): WheelCallback | null {
  const [prefix, owner, action, raw] = data.split(":");
  const ownerId = Number(owner);
  if (prefix !== "w" || !Number.isInteger(ownerId) || !ACTIONS.includes(action as WheelAction)) {
    return null;
  }
  const value = raw === undefined ? undefined : Number(raw);
  if (value !== undefined && !Number.isInteger(value)) {
    return null;
  }
  return { ownerId, action: action as WheelAction, value };
}

function range(from: number, to: number): number[] {
  return to < from ? [] : Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

export function groupCountOptions(memberCount: number): number[] {
  return range(2, Math.min(memberCount, MAX_BUTTONS));
}

export function hasCustomGroupCount(memberCount: number): boolean {
  return memberCount > MAX_BUTTONS;
}

export function maxGroupSize(memberCount: number, groupCount: number): number {
  return Math.floor(memberCount / groupCount);
}

export function groupSizeOptions(memberCount: number, groupCount: number): number[] {
  return range(1, Math.min(maxGroupSize(memberCount, groupCount), MAX_BUTTONS));
}

export function hasCustomGroupSize(memberCount: number, groupCount: number): boolean {
  return maxGroupSize(memberCount, groupCount) > MAX_BUTTONS;
}

function numberKeyboard(
  ownerId: number,
  values: number[],
  pickAction: WheelAction,
  customAction: WheelAction | null,
  withBack: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const buttons = values.map((value) =>
    InlineKeyboard.text(String(value), encodeCallback({ ownerId, action: pickAction, value })),
  );
  if (customAction) {
    buttons.push(InlineKeyboard.text("Custom", encodeCallback({ ownerId, action: customAction })));
  }
  buttons.forEach((button, index) => {
    if (index > 0 && index % BUTTONS_PER_ROW === 0) {
      keyboard.row();
    }
    keyboard.add(button);
  });

  keyboard.row();
  if (withBack) {
    keyboard.text("Back", encodeCallback({ ownerId, action: "back" }));
  }
  keyboard.text("Cancel", encodeCallback({ ownerId, action: "x" }));
  return keyboard;
}

export function groupCountKeyboard(ownerId: number, memberCount: number): InlineKeyboard {
  return numberKeyboard(
    ownerId,
    groupCountOptions(memberCount),
    "tc",
    hasCustomGroupCount(memberCount) ? "cc" : null,
    false,
  );
}

export function groupSizeKeyboard(ownerId: number, memberCount: number, groupCount: number): InlineKeyboard {
  return numberKeyboard(
    ownerId,
    groupSizeOptions(memberCount, groupCount),
    "ts",
    hasCustomGroupSize(memberCount, groupCount) ? "cs" : null,
    true,
  );
}

export function confirmKeyboard(ownerId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Spin", encodeCallback({ ownerId, action: "go" }))
    .text("Back", encodeCallback({ ownerId, action: "back" }))
    .text("Cancel", encodeCallback({ ownerId, action: "x" }));
}

export function pickChatKeyboard(ownerId: number, chats: { id: number; title: string }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  chats.forEach((chat) => {
    keyboard.text(chat.title, encodeCallback({ ownerId, action: "pk", value: chat.id })).row();
  });
  return keyboard.text("Cancel", encodeCallback({ ownerId, action: "x" }));
}
