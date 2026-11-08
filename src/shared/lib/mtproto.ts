import { TelegramClient } from "telegram";
import { LogLevel } from "telegram/extensions/Logger.js";
import { StringSession } from "telegram/sessions/index.js";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

const SESSION_KEY = "mtproto_bot_session";

async function loadSession(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: SESSION_KEY } });
  return setting?.value ?? "";
}

async function saveSession(value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SESSION_KEY },
    create: { key: SESSION_KEY, value },
    update: { value },
  });
}

export function isMtprotoEnabled(): boolean {
  return env.tgApiId !== null && env.tgApiHash !== null;
}

export async function withBotClient<T>(task: (client: TelegramClient) => Promise<T>): Promise<T> {
  const { tgApiId, tgApiHash } = env;
  if (tgApiId === null || tgApiHash === null) {
    throw new Error("TG_API_ID and TG_API_HASH are not set");
  }

  const saved = await loadSession();
  const session = new StringSession(saved);
  const client = new TelegramClient(session, tgApiId, tgApiHash, { connectionRetries: 2 });
  client.setLogLevel(LogLevel.ERROR);

  await client.connect();
  try {
    if (!(await client.checkAuthorization())) {
      await client.signInBot({ apiId: tgApiId, apiHash: tgApiHash }, { botAuthToken: env.botToken });
    }
    const current = session.save();
    if (current && current !== saved) {
      await saveSession(current);
    }
    return await task(client);
  } finally {
    await client.disconnect();
  }
}
