import "dotenv/config";

export class MissingEnvError extends Error {
  constructor(varName: string) {
    super(`Missing required environment variable: ${varName}`);
    this.name = "MissingEnvError";
  }
}

export function validateEnv(): { stitchApiKey: string } {
  const stitchApiKey = process.env.STITCH_API_KEY;

  if (!stitchApiKey) throw new MissingEnvError("STITCH_API_KEY");

  return { stitchApiKey };
}
