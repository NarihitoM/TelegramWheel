import { Composer, type Context } from "grammy";

const CREDIT_MESSAGE = "Spin Wheel Bot made by Narihito\nGitHub: https://github.com/NarihitoM";

export const creditHandler = new Composer<Context>();

creditHandler.command("credit", (ctx) => ctx.reply(CREDIT_MESSAGE, { link_preview_options: { is_disabled: true } }));
