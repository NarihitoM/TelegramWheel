import { Bot } from "grammy";
import { chatHandler } from "./modules/chat/chat.handler.js";
import { creditHandler } from "./modules/credit/credit.handler.js";
import { membersHandler } from "./modules/members/members.handler.js";
import { spinHandler } from "./modules/spin/spin.handler.js";
import { startHandler } from "./modules/start/start.handler.js";
import { env } from "./shared/config/env.js";

export const BOT_COMMANDS = [
  { command: "start", description: "How to use this bot" },
  { command: "wheel", description: "Split into groups, pick a winner, flip a coin or roll a dice" },
  { command: "credit", description: "Who made this bot" },
  { command: "donate", description: "Support the bot" },
];

export const BOT_DESCRIPTION = [
  "Spin Wheel Bot splits chat members into random groups, picks winners, flips a coin and rolls a dice.",
  "",
  "How to use:",
  "1. Add the bot to a group and make it an admin.",
  "2. Send /wheel and choose a mode.",
  "3. For groups, pick the number of groups and members per group. For winners, pick how many.",
  "4. The result is posted in the chat.",
  "",
  "Support the bot: send /donate",
  "Made by Narihito - github.com/NarihitoM",
].join("\n");

export const BOT_SHORT_DESCRIPTION = "Split members into groups, pick winners, flip a coin or roll a dice with /wheel. Made by Narihito.";

export const ALLOWED_UPDATES = ["message", "callback_query", "my_chat_member", "chat_member"] as const;

export function createBot(): Bot {
  const bot = new Bot(env.botToken);

  bot.use(membersHandler);
  bot.use(startHandler);
  bot.use(creditHandler);
  bot.use(chatHandler);
  bot.use(spinHandler);

  bot.catch((error) => {
    console.error(`Error while handling update ${error.ctx.update.update_id}:`, error.error);
  });

  return bot;
}
