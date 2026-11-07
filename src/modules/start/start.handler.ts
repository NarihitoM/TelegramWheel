import { Composer, type Context } from "grammy";

export const START_MESSAGE = [
  "<b>Spin Wheel Bot</b>",
  "Randomly split the members of a group or channel into teams.",
  "",
  "<b>How to use</b>",
  "1. Add the bot to the group or channel and make it an admin.",
  "2. Send /wheel. Known members are already in the list.",
  "3. Missing members tap <b>Join</b>. Members who want out tap <b>Leave</b>.",
  "4. The starter taps <b>Start</b> and picks the number of groups and members per group.",
  "5. Tap <b>Spin</b> to post the result as text and as an image.",
  "",
  "<b>Who is in the list</b>",
  "Admins, people who join after the bot is added, and anyone who sends a message. Telegram does not show quiet members to bots, so they tap Join.",
  "",
  "<b>Channels</b>",
  "Send /wheel to the bot in private chat and choose the channel.",
  "",
  "<b>Good to know</b>",
  "- Anyone in the chat can start a wheel.",
  "- Only the starter can press Start, Spin and the number buttons.",
  "- Wait 10 seconds between wheels in the same chat.",
  "- Members who don't fit into a group are listed as Not picked.",
  "",
  "<b>Commands</b>",
  "/wheel - spin the wheel",
  "/start - show this message",
  "/credit - who made this bot",
].join("\n");

export const startHandler = new Composer<Context>();

startHandler.command(["start", "help"], (ctx) => ctx.reply(START_MESSAGE, { parse_mode: "HTML" }));
