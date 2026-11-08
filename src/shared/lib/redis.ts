import { env } from "../config/env.js";

const REDIS_TIMEOUT_MS = 3_000;

interface RedisResponse {
  result?: unknown;
  error?: string;
}

interface RestConnection {
  url: string;
  token: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toRestConnection(redisUrl: string): RestConnection | null {
  try {
    const parsed = new URL(redisUrl);
    const token = decodeURIComponent(parsed.password);
    if (!["redis:", "rediss:"].includes(parsed.protocol) || !parsed.hostname || !token) {
      return null;
    }
    return { url: `https://${parsed.hostname}`, token };
  } catch {
    return null;
  }
}

async function command(args: (string | number)[]): Promise<unknown> {
  const connection = env.redisUrl ? toRestConnection(env.redisUrl) : null;
  if (!connection) {
    return null;
  }
  const { url, token } = connection;

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
