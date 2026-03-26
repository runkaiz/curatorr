function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  get PLEX_URL() {
    return requireEnv("PLEX_URL");
  },
  get PLEX_TOKEN() {
    return requireEnv("PLEX_TOKEN");
  },
  get TAUTULLI_URL() {
    return requireEnv("TAUTULLI_URL");
  },
  get TAUTULLI_API_KEY() {
    return requireEnv("TAUTULLI_API_KEY");
  },
  get ADMIN_PASSWORD() {
    return requireEnv("ADMIN_PASSWORD");
  },
  get SESSION_SECRET() {
    return requireEnv("SESSION_SECRET");
  },
  get DATABASE_URL() {
    return optionalEnv("DATABASE_URL");
  },
  get SEERR_URL() {
    return optionalEnv("SEERR_URL");
  },
  get SEERR_API_KEY() {
    return optionalEnv("SEERR_API_KEY");
  },
};
