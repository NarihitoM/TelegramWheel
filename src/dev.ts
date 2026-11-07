import { createBot } from "./bot.js";

process.loadEnvFile();

const bot = createBot();

await bot.api.deleteWebhook();
await bot.start({
  onStart: (info) => console.log(`@${info.username} is running with long polling`),
});
