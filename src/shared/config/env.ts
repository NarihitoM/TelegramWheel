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
};
