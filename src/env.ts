import "dotenv/config";

export class MissingEnvError extends Error {
  constructor(varName: string) {
    super(`Missing required environment variable: ${varName}`);
    this.name = "MissingEnvError";
  }
}

export function validateEnv(): { stitchApiKey: string; ollamaModel: string } {
  const stitchApiKey = process.env.STITCH_API_KEY;
  const ollamaModel = process.env.OLLAMA_MODEL;

  if (!stitchApiKey) throw new MissingEnvError("STITCH_API_KEY");
  if (!ollamaModel) throw new MissingEnvError("OLLAMA_MODEL");

  return { stitchApiKey, ollamaModel };
}
