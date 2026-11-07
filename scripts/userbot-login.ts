import { createInterface } from "node:readline/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

process.loadEnvFile();

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
if (!Number.isInteger(apiId) || !apiHash) {
  throw new Error("Set TG_API_ID and TG_API_HASH in .env first (from https://my.telegram.org)");
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 3 });

await client.start({
  phoneNumber: () => rl.question("Phone number (with country code): "),
  phoneCode: () => rl.question("Login code from Telegram: "),
  password: () => rl.question("2FA password (leave empty if none): "),
  onError: (error) => console.error(error.message),
});

console.log("\nPut this value in TG_SESSION (keep it secret):\n");
console.log(client.session.save());

rl.close();
await client.disconnect();
process.exit(0);
