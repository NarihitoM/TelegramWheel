import { Api, GrammyError } from "grammy";
import { ALLOWED_UPDATES, BOT_COMMANDS, BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION } from "../src/bot.js";
import { env } from "../src/shared/config/env.js";

process.loadEnvFile();

const api = new Api(env.botToken);
const url = `${env.webhookUrl.replace(/\/$/, "")}/api/webhook`;

try {
  await api.setWebhook(url, {
    secret_token: env.webhookSecret,
    allowed_updates: [...ALLOWED_UPDATES],
    drop_pending_updates: true,
  });
  await api.setMyCommands(BOT_COMMANDS);
  await api.setMyDescription(BOT_DESCRIPTION);
  await api.setMyShortDescription(BOT_SHORT_DESCRIPTION);
} catch (error) {
  if (error instanceof GrammyError) {
    console.error(`Telegram rejected the request: ${error.description}`);
    process.exit(1);
  }
  throw error;
}

const info = await api.getWebhookInfo();
console.log(`Webhook set to ${info.url}`);
if (info.last_error_message) {
  console.log(`Last error: ${info.last_error_message}`);
}
