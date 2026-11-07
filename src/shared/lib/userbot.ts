import { TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";
import { env } from "../config/env.js";

export async function withUserbot<T>(task: (client: TelegramClient) => Promise<T>): Promise<T> {
  const client = new TelegramClient(new StringSession(env.tgSession), env.tgApiId, env.tgApiHash, {
    connectionRetries: 3,
  });
  client.setLogLevel(LogLevel.ERROR);

  await client.connect();
  try {
    return await task(client);
  } finally {
    await client.disconnect();
  }
}
