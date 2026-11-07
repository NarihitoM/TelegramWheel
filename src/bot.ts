import { Bot } from "grammy";
import { chatHandler } from "./modules/chat/chat.handler.js";
import { creditHandler } from "./modules/credit/credit.handler.js";
import { membersHandler } from "./modules/members/members.handler.js";
import { spinHandler } from "./modules/spin/spin.handler.js";
import { startHandler } from "./modules/start/start.handler.js";
import { env } from "./shared/config/env.js";

export const BOT_COMMANDS = [
  { command: "start", description: "How to use this bot" },
  { command: "wheel", description: "Spin the wheel and split members into groups" },
  { command: "credit", description: "Who made this bot" },
];

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
