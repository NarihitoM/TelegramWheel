import { PrismaAdapter } from "@grammyjs/storage-prisma";
import { Bot, session } from "grammy";
import { chatHandler } from "./modules/chat/chat.handler.js";
import { creditHandler } from "./modules/credit/credit.handler.js";
import { spinHandler } from "./modules/spin/spin.handler.js";
import { startHandler } from "./modules/start/start.handler.js";
import { env } from "./shared/config/env.js";
import { prisma } from "./shared/lib/prisma.js";
import type { BotContext, WheelSession } from "./shared/types/context.js";

export const BOT_COMMANDS = [
  { command: "start", description: "How to use this bot" },
  { command: "wheel", description: "Spin the wheel and split members into groups" },
  { command: "credit", description: "Who made this bot" },
];

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.botToken);

  bot.use(startHandler);
  bot.use(creditHandler);
  bot.use(chatHandler);
  bot.use(
    session({
      initial: (): WheelSession => ({ step: "idle", members: [] }),
      storage: new PrismaAdapter<WheelSession>(prisma.session),
      getSessionKey: (ctx) => (ctx.chat && ctx.from ? `${ctx.chat.id}:${ctx.from.id}` : undefined),
    }),
  );
  bot.use(spinHandler);

  bot.catch((error) => {
    console.error(`Error while handling update ${error.ctx.update.update_id}:`, error.error);
  });

  return bot;
}
