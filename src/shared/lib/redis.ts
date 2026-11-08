import { env } from "../config/env.js";

const REDIS_TIMEOUT_MS = 3_000;

interface RedisResponse {
  result?: unknown;
  error?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function command(args: (string | number)[]): Promise<unknown> {
  const url = env.redisUrl;
  const token = env.redisToken;
  if (!url || !token) {
    return null;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Redis responded with status ${response.status}`);
  }

  const body = (await response.json()) as RedisResponse;
  if (body.error) {
    throw new Error(body.error);
  }
  return body.result ?? null;
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    const result = await command(["GET", key]);
    return typeof result === "string" ? result : null;
  } catch (error) {
    console.error(`Redis GET ${key} failed:`, errorMessage(error));
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await command(["SET", key, value, "EX", ttlSeconds]);
  } catch (error) {
    console.error(`Redis SET ${key} failed:`, errorMessage(error));
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await command(["DEL", key]);
  } catch (error) {
    console.error(`Redis DEL ${key} failed:`, errorMessage(error));
  }
}
