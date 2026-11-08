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
    .text("Add/Remove", encodeCallback({ wheelId, action: "rm" }))
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

export const MANAGE_PAGE_SIZE = 8;
const MAX_MANAGE_LABEL = 40;

export type ManageMode = "add" | "remove";

export type ManageCallback =
  | { wheelId: number; kind: "page"; mode: ManageMode; page: number }
  | { wheelId: number; kind: "pick"; mode: ManageMode; userId: number; page: number }
  | { wheelId: number; kind: "back" };

const PAGE_CODES: Record<ManageMode, string> = { remove: "p", add: "a" };
const PICK_CODES: Record<ManageMode, string> = { remove: "x", add: "y" };

export function encodeManage(callback: ManageCallback): string {
  switch (callback.kind) {
    case "page":
      return `r:${callback.wheelId}:${PAGE_CODES[callback.mode]}:${callback.page}`;
    case "pick":
      return `r:${callback.wheelId}:${PICK_CODES[callback.mode]}:${callback.userId}:${callback.page}`;
    case "back":
      return `r:${callback.wheelId}:b`;
  }
}

export function decodeManage(data: string): ManageCallback | null {
  const [prefix, rawId, code, first, second] = data.split(":");
  const wheelId = Number(rawId);
  if (prefix !== "r" || !Number.isInteger(wheelId)) {
    return null;
  }
  if (code === "b") {
    return { wheelId, kind: "back" };
  }
  const page = Number(code === "p" || code === "a" ? first : second);
  if (!Number.isInteger(page)) {
    return null;
  }
  if (code === "p" || code === "a") {
    return { wheelId, kind: "page", mode: code === "a" ? "add" : "remove", page };
  }
  const userId = Number(first);
  if ((code === "x" || code === "y") && Number.isInteger(userId)) {
    return { wheelId, kind: "pick", mode: code === "y" ? "add" : "remove", userId, page };
  }
  return null;
}

export function managePageCount(memberCount: number): number {
  return Math.max(1, Math.ceil(memberCount / MANAGE_PAGE_SIZE));
}

function manageLabel(mode: ManageMode, name: string): string {
  const chars = [...name];
  const short = chars.length > MAX_MANAGE_LABEL ? `${chars.slice(0, MAX_MANAGE_LABEL - 1).join("")}\u2026` : name;
  return `${mode === "add" ? "Add" : "Remove"} ${short}`;
}

export function manageKeyboard(
  wheelId: number,
  mode: ManageMode,
  members: { id: string; name: string }[],
  page: number,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const pages = managePageCount(members.length);
  const current = Math.min(Math.max(page, 0), pages - 1);
  members.slice(current * MANAGE_PAGE_SIZE, (current + 1) * MANAGE_PAGE_SIZE).forEach((member) => {
    keyboard
      .text(
        manageLabel(mode, member.name),
        encodeManage({ wheelId, kind: "pick", mode, userId: Number(member.id), page: current }),
      )
      .row();
  });
  if (current > 0) {
    keyboard.text("Previous", encodeManage({ wheelId, kind: "page", mode, page: current - 1 }));
  }
  if (current < pages - 1) {
    keyboard.text("Next", encodeManage({ wheelId, kind: "page", mode, page: current + 1 }));
  }
  const other: ManageMode = mode === "add" ? "remove" : "add";
  return keyboard
    .row()
    .text(other === "add" ? "Add people" : "Remove people", encodeManage({ wheelId, kind: "page", mode: other, page: 0 }))
    .text("Back", encodeManage({ wheelId, kind: "back" }));
}
