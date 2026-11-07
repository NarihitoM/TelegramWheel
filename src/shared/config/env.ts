function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
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
    const id = Number(requireEnv("TG_API_ID"));
    if (!Number.isInteger(id)) {
      throw new Error("TG_API_ID must be a number");
    }
    return id;
  },
  get tgApiHash() {
    return requireEnv("TG_API_HASH");
  },
  get tgSession() {
    return requireEnv("TG_SESSION");
  },
};
