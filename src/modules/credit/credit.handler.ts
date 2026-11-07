import { Composer } from "grammy";
import type { BotContext } from "../../shared/types/context.js";

const CREDIT_MESSAGE = "Spin Wheel Bot made by Narihito\nGitHub: https://github.com/NarihitoM";

export const creditHandler = new Composer<BotContext>();

creditHandler.command("credit", (ctx) => ctx.reply(CREDIT_MESSAGE, { link_preview_options: { is_disabled: true } }));
