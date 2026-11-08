import { Composer, type Context } from "grammy";

export const START_MESSAGE = [
  "<b>Spin Wheel Bot</b>",
  "Randomly split the members of a group or channel into groups.",
  "",
  "<b>How to use</b>",
  "1. Add the bot to the group or channel and make it an admin.",
  "2. Send /wheel. All group members are added to the list automatically.",
  "3. Members who want out tap <b>Leave</b>. Anyone missing taps <b>Join</b>.",
  "4. The starter taps <b>Start</b> and picks the number of groups and members per group.",
  "5. Tap <b>Spin</b> to post the result as text and as an image.",
  "",
  "<b>Channels</b>",
  "Send /wheel to the bot in private chat and choose the channel.",
  "",
  "<b>Good to know</b>",
  "- Anyone in the chat can start a wheel.",
  "- Only the starter can press Start, Spin and the number buttons.",
  "- One wheel runs per chat. Tap <b>Exit</b> to close it so someone else can start.",
  "- The starter or an admin can exit any time. Anyone can exit after 1 minute of no activity.",
  "- Wait 10 seconds between wheels in the same chat.",
  "- Members who don't fit go into one extra group, so nobody is left out.",
  "",
  "<b>Commands</b>",
  "/wheel - spin the wheel",
  "/start - show this message",
  "/credit - who made this bot",
].join("\n");

export const startHandler = new Composer<Context>();

startHandler.command(["start", "help"], (ctx) => ctx.reply(START_MESSAGE, { parse_mode: "HTML" }));
