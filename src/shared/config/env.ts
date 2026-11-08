function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function optionalNumber(name: string): number | null {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export const env = {
  get botToken() {
    return requireEnv("BOT_TOKEN");
  },
  get webhookSecret() {
    return requireEnv("WEBHOOK_SECRET");
  },
  get webhookUrl() {
    return requireEnv("WEBHOOK_URL");
  },
  get tgApiId() {
    return optionalNumber("TG_API_ID");
  },
  get tgApiHash() {
    return process.env.TG_API_HASH || null;
  },
  get donateName() {
    return process.env.DONATE_NAME || null;
  },
  get donateKbzPay() {
    return process.env.DONATE_KBZPAY || null;
  },
  get redisUrl() {
    return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || null;
  },
  get redisToken() {
    return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || null;
  },
};
