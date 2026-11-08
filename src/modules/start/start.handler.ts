import { Composer, type Context } from "grammy";

export const START_MESSAGE = [
  "<b>Spin Wheel Bot</b>",
  "Split members into random groups, pick a winner, flip a coin or roll a dice.",
  "",
  "<b>How to use</b>",
  "1. Add the bot to the group or channel and make it an admin.",
  "2. Send /wheel and choose: <b>Split into groups</b>, <b>Pick a winner</b>, <b>Coin flip</b> or <b>Dice</b>.",
  "3. Coin flip and Dice play an animation, then post the result.",
  "4. For groups and winners, all members are added automatically. Members who want out tap <b>Leave</b>. Anyone missing taps <b>Join</b>.",
  "5. The starter taps <b>Start</b>, then picks the number of groups and members per group, or the number of winners.",
  "6. The result is posted in the chat as text and as an image. Winners also get a celebration.",
  "",
  "<b>Channels</b>",
  "Channel admins: send /wheel to the bot in private chat and choose the channel.",
  "",
  "<b>Good to know</b>",
  "- Anyone in the chat can send /wheel and choose from the menu.",
  "- Whoever chooses Split into groups or Pick a winner becomes the starter.",
  "- Only the starter can press Start, Spin and the number buttons.",
  "- The starter or an admin can tap <b>Remove</b> to take out people who are offline. The list opens in a private chat with the bot, so only they see it.",
  "- One wheel runs per chat. Tap <b>Exit</b> to close it so someone else can start.",
  "- The starter or an admin can exit any time. Anyone can exit after 1 minute of no activity.",
  "- Wait 10 seconds between wheels in the same chat.",
  "",
  "<b>Commands</b>",
  "/wheel - open the wheel menu",
  "/start - show this message",
  "/credit - who made this bot",
  "/donate - support the bot",
].join("\n");

export const startHandler = new Composer<Context>();

startHandler.command(["start", "help"], async (ctx, next) => {
  if (ctx.match) {
    await next();
    return;
  }
  await ctx.reply(START_MESSAGE, { parse_mode: "HTML" });
});
