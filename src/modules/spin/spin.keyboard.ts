import { InlineKeyboard } from "grammy";

export const MAX_BUTTONS = 8;
const BUTTONS_PER_ROW = 4;

export type WheelAction = "j" | "l" | "start" | "tc" | "ts" | "cc" | "cs" | "go" | "back" | "x";

export interface WheelCallback {
  wheelId: number;
  action: WheelAction;
  value?: number;
}

const ACTIONS: readonly WheelAction[] = ["j", "l", "start", "tc", "ts", "cc", "cs", "go", "back", "x"];

export function encodeCallback({ wheelId, action, value }: WheelCallback): string {
  return value === undefined ? `w:${wheelId}:${action}` : `w:${wheelId}:${action}:${value}`;
}

export function decodeCallback(data: string): WheelCallback | null {
  const [prefix, id, action, raw] = data.split(":");
  const wheelId = Number(id);
  if (prefix !== "w" || !Number.isInteger(wheelId) || !ACTIONS.includes(action as WheelAction)) {
    return null;
  }
  const value = raw === undefined ? undefined : Number(raw);
  if (value !== undefined && !Number.isInteger(value)) {
    return null;
  }
  return { wheelId, action: action as WheelAction, value };
}

export function encodePickChat(chatId: number): string {
  return `p:${chatId}`;
}

export function decodePickChat(data: string): number | null {
  const [prefix, raw] = data.split(":");
  const chatId = Number(raw);
  return prefix === "p" && Number.isInteger(chatId) ? chatId : null;
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
  wheelId: number,
  values: number[],
  pickAction: WheelAction,
  customAction: WheelAction | null,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const buttons = values.map((value) =>
    InlineKeyboard.text(String(value), encodeCallback({ wheelId, action: pickAction, value })),
  );
  if (customAction) {
    buttons.push(InlineKeyboard.text("Custom", encodeCallback({ wheelId, action: customAction })));
  }
  buttons.forEach((button, index) => {
    if (index > 0 && index % BUTTONS_PER_ROW === 0) {
      keyboard.row();
    }
    keyboard.add(button);
  });

  return keyboard
    .row()
    .text("Back", encodeCallback({ wheelId, action: "back" }))
    .text("Cancel", encodeCallback({ wheelId, action: "x" }));
}

export function joinKeyboard(wheelId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Join", encodeCallback({ wheelId, action: "j" }))
    .text("Leave", encodeCallback({ wheelId, action: "l" }))
    .row()
    .text("Start", encodeCallback({ wheelId, action: "start" }))
    .text("Cancel", encodeCallback({ wheelId, action: "x" }));
}

export function groupCountKeyboard(wheelId: number, memberCount: number): InlineKeyboard {
  return numberKeyboard(
    wheelId,
    groupCountOptions(memberCount),
    "tc",
    hasCustomGroupCount(memberCount) ? "cc" : null,
  );
}

export function groupSizeKeyboard(wheelId: number, memberCount: number, groupCount: number): InlineKeyboard {
  return numberKeyboard(
    wheelId,
    groupSizeOptions(memberCount, groupCount),
    "ts",
    hasCustomGroupSize(memberCount, groupCount) ? "cs" : null,
  );
}

export function confirmKeyboard(wheelId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Spin", encodeCallback({ wheelId, action: "go" }))
    .text("Back", encodeCallback({ wheelId, action: "back" }))
    .text("Cancel", encodeCallback({ wheelId, action: "x" }));
}

export function pickChatKeyboard(chats: { id: number; title: string }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  chats.forEach((chat) => {
    keyboard.text(chat.title, encodePickChat(chat.id)).row();
  });
  return keyboard;
}
