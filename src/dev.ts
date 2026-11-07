import { ALLOWED_UPDATES, createBot } from "./bot.js";

process.loadEnvFile();

const bot = createBot();

await bot.api.deleteWebhook();
await bot.start({
  allowed_updates: [...ALLOWED_UPDATES],
  onStart: (info) => console.log(`@${info.username} is running with long polling`),
});
