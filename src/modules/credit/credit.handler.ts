import { Composer, type Context } from "grammy";
import { env } from "../../shared/config/env.js";

const CREDIT_MESSAGE = [
  "Spin Wheel Bot made by Narihito",
  "GitHub: https://github.com/NarihitoM",
  "",
  "Enjoying the bot? Send /donate to support it.",
].join("\n");

function donateMessage(): string {
  if (!env.donateKbzPay) {
    return "Donations are not set up yet. Thanks for wanting to support the bot!";
  }

  return [
    "Support Spin Wheel Bot",
    "Every donation helps keep the bot running. Thank you!",
    "",
    `KPay: ${env.donateKbzPay}`,
    ...(env.donateName ? [`Name: ${env.donateName}`] : []),
  ].join("\n");
}

export const creditHandler = new Composer<Context>();

creditHandler.command("credit", (ctx) => ctx.reply(CREDIT_MESSAGE, { link_preview_options: { is_disabled: true } }));
creditHandler.command(["donate", "support"], (ctx) => ctx.reply(donateMessage()));
