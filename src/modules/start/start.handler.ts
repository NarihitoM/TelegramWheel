import { Composer } from "grammy";
import type { BotContext } from "../../shared/types/context.js";

export const START_MESSAGE = [
  "<b>Spin Wheel Bot</b>",
  "Randomly split the members of a group or channel into teams.",
  "",
  "<b>How to use</b>",
  "1. Add me to your group or channel.",
  "2. Add the helper account too (it must be an admin in channels).",
  "3. Send /wheel, then pick how many groups and how many members per group.",
  "4. Tap <b>Spin</b> and I post the result as text and as an image.",
  "",
  "<b>Channels</b>",
  "Send /wheel to me here in private chat and choose the channel.",
  "",
  "<b>Good to know</b>",
  "- Anyone in the chat can start a wheel.",
  "- Only the person who started it can press its buttons.",
  "- Wait 10 seconds between wheels in the same chat.",
  "- Members who don't fit into a group are listed as Not picked.",
  "",
  "<b>Commands</b>",
  "/wheel - spin the wheel",
  "/start - show this message",
  "/credit - who made this bot",
].join("\n");

export const startHandler = new Composer<BotContext>();

startHandler.command(["start", "help"], (ctx) => ctx.reply(START_MESSAGE, { parse_mode: "HTML" }));
