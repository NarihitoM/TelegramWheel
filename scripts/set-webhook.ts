import { Api } from "grammy";
import { BOT_COMMANDS } from "../src/bot.js";
import { env } from "../src/shared/config/env.js";

process.loadEnvFile();

const api = new Api(env.botToken);
const url = `${env.webhookUrl.replace(/\/$/, "")}/api/webhook`;

await api.setWebhook(url, {
  secret_token: env.webhookSecret,
  allowed_updates: ["message", "callback_query", "my_chat_member"],
  drop_pending_updates: true,
});
await api.setMyCommands(BOT_COMMANDS);

const info = await api.getWebhookInfo();
console.log(`Webhook set to ${info.url}`);
if (info.last_error_message) {
  console.log(`Last error: ${info.last_error_message}`);
}
