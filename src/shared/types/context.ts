import type { Context, SessionFlavor } from "grammy";
import type { Member } from "../../modules/spin/spin.types.js";

export type WheelStep = "idle" | "pickChat" | "teamCount" | "teamSize" | "customTeamCount" | "customTeamSize" | "confirm";

export interface WheelSession {
  step: WheelStep;
  allowedChatIds?: number[];
  targetChatId?: number;
  targetTitle?: string;
  panelChatId?: number;
  panelMessageId?: number;
  members: Member[];
  teamCount?: number;
  teamSize?: number;
}

export type BotContext = Context & SessionFlavor<WheelSession>;
