import { InlineKeyboard } from "grammy";

export const MAX_BUTTONS = 8;
const BUTTONS_PER_ROW = 4;

export type WheelAction =
  | "split"
  | "win"
  | "coin"
  | "dice"
  | "j"
  | "l"
  | "rm"
  | "start"
  | "tc"
  | "ts"
  | "cc"
  | "cs"
  | "wc"
  | "cw"
  | "go"
  | "back"
  | "x";

export const MODE_ACTIONS: readonly WheelAction[] = ["split", "win", "coin", "dice"];

export interface WheelCallback {
  wheelId: number;
  action: WheelAction;
  value?: number;
}

const ACTIONS: readonly WheelAction[] = [...MODE_ACTIONS, "j", "l", "rm", "start", "tc", "ts", "cc", "cs", "wc", "cw", "go", "back", "x"];

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

export function maxWinners(memberCount: number): number {
  return memberCount - 1;
}

export function winnerCountOptions(memberCount: number): number[] {
  return range(1, Math.min(maxWinners(memberCount), MAX_BUTTONS));
}

export function hasCustomWinnerCount(memberCount: number): boolean {
  return maxWinners(memberCount) > MAX_BUTTONS;
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
    .text("Exit", encodeCallback({ wheelId, action: "x" }));
}

export function modeKeyboard(wheelId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Split into groups", encodeCallback({ wheelId, action: "split" }))
    .text("Pick a winner", encodeCallback({ wheelId, action: "win" }))
    .row()
    .text("Coin flip", encodeCallback({ wheelId, action: "coin" }))
    .text("Dice", encodeCallback({ wheelId, action: "dice" }))
    .row()
    .text("Exit", encodeCallback({ wheelId, action: "x" }));
}

export function joinKeyboard(wheelId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Join", encodeCallback({ wheelId, action: "j" }))
    .text("Leave", encodeCallback({ wheelId, action: "l" }))
    .row()
    .text("Start", encodeCallback({ wheelId, action: "start" }))
    .text("Remove", encodeCallback({ wheelId, action: "rm" }))
    .text("Exit", encodeCallback({ wheelId, action: "x" }));
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

export function winnerCountKeyboard(wheelId: number, memberCount: number): InlineKeyboard {
  return numberKeyboard(
    wheelId,
    winnerCountOptions(memberCount),
    "wc",
    hasCustomWinnerCount(memberCount) ? "cw" : null,
  );
}

export function confirmKeyboard(wheelId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("Spin", encodeCallback({ wheelId, action: "go" }))
    .text("Back", encodeCallback({ wheelId, action: "back" }))
    .text("Exit", encodeCallback({ wheelId, action: "x" }));
}

export function pickChatKeyboard(chats: { id: number; title: string }[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  chats.forEach((chat) => {
    keyboard.text(chat.title, encodePickChat(chat.id)).row();
  });
  return keyboard;
}

export const REMOVE_PAGE_SIZE = 8;
const MAX_REMOVE_LABEL = 40;

export type RemoveCallback =
  | { wheelId: number; kind: "page"; page: number }
  | { wheelId: number; kind: "remove"; userId: number; page: number }
  | { wheelId: number; kind: "done" };

export function encodeRemove(callback: RemoveCallback): string {
  switch (callback.kind) {
    case "page":
      return `r:${callback.wheelId}:p:${callback.page}`;
    case "remove":
      return `r:${callback.wheelId}:x:${callback.userId}:${callback.page}`;
    case "done":
      return `r:${callback.wheelId}:d`;
  }
}

export function decodeRemove(data: string): RemoveCallback | null {
  const [prefix, rawId, kind, first, second] = data.split(":");
  const wheelId = Number(rawId);
  if (prefix !== "r" || !Number.isInteger(wheelId)) {
    return null;
  }
  if (kind === "d") {
    return { wheelId, kind: "done" };
  }
  if (kind === "p" && Number.isInteger(Number(first))) {
    return { wheelId, kind: "page", page: Number(first) };
  }
  if (kind === "x" && Number.isInteger(Number(first)) && Number.isInteger(Number(second))) {
    return { wheelId, kind: "remove", userId: Number(first), page: Number(second) };
  }
  return null;
}

export function removePageCount(memberCount: number): number {
  return Math.max(1, Math.ceil(memberCount / REMOVE_PAGE_SIZE));
}

function removeLabel(name: string): string {
  const chars = [...name];
  const short = chars.length > MAX_REMOVE_LABEL ? `${chars.slice(0, MAX_REMOVE_LABEL - 1).join("")}\u2026` : name;
  return `Remove ${short}`;
}

export function removeKeyboard(wheelId: number, members: { id: string; name: string }[], page: number): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const pages = removePageCount(members.length);
  const current = Math.min(Math.max(page, 0), pages - 1);
  members.slice(current * REMOVE_PAGE_SIZE, (current + 1) * REMOVE_PAGE_SIZE).forEach((member) => {
    keyboard
      .text(removeLabel(member.name), encodeRemove({ wheelId, kind: "remove", userId: Number(member.id), page: current }))
      .row();
  });
  if (current > 0) {
    keyboard.text("Previous", encodeRemove({ wheelId, kind: "page", page: current - 1 }));
  }
  if (current < pages - 1) {
    keyboard.text("Next", encodeRemove({ wheelId, kind: "page", page: current + 1 }));
  }
  return keyboard.row().text("Done", encodeRemove({ wheelId, kind: "done" }));
}
