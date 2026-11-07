import { Composer } from "grammy";
import type { BotContext } from "../../shared/types/context.js";

export const creditHandler = new Composer<BotContext>();

creditHandler.command("credit", (ctx) => ctx.reply("Spin Wheel Bot made by Narihito"));
