import { Composer, type Context } from "grammy";

export const START_MESSAGE = [
  "<b>Spin Wheel Bot</b>",
  "Randomly split the members of a group or channel into teams.",
  "",
  "<b>How to use</b>",
  "1. Add me to your group or channel and make me an admin.",
  "2. Send /wheel. Members I know are already in the list.",
  "3. Anyone missing taps <b>Join</b>. Anyone who wants out taps <b>Leave</b>.",
  "4. The starter taps <b>Start</b>, picks how many groups and members per group.",
  "5. Tap <b>Spin</b> and I post the result as text and as an image.",
  "",
  "<b>Who is in the list</b>",
  "Admins, people who join after I'm added, and anyone who sends a message. Telegram doesn't let bots see quiet members, so they tap Join.",
  "",
  "<b>Channels</b>",
  "Send /wheel to me here in private chat and choose the channel.",
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
