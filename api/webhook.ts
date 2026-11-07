import { webhookCallback } from "grammy";
import { createBot } from "../src/bot.js";
import { env } from "../src/shared/config/env.js";

const handleUpdate = webhookCallback(createBot(), "std/http", {
  secretToken: env.webhookSecret,
  timeoutMilliseconds: 55_000,
});

export function POST(request: Request): Promise<Response> {
  return handleUpdate(request);
}

export function GET(): Response {
  return new Response("Spin Wheel Bot is running");
}
