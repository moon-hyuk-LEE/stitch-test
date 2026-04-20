import { describe, it, expect, afterEach } from "vitest";
import { validateEnv, MissingEnvError } from "../src/env.js";

describe("validateEnv", () => {
  const saved = { ...process.env };

  afterEach(() => {
    if (saved.STITCH_API_KEY === undefined) {
      delete process.env.STITCH_API_KEY;
    } else {
      process.env.STITCH_API_KEY = saved.STITCH_API_KEY;
    }
    if (saved.OLLAMA_MODEL === undefined) {
      delete process.env.OLLAMA_MODEL;
    } else {
      process.env.OLLAMA_MODEL = saved.OLLAMA_MODEL;
    }
  });

  it("두 환경변수가 모두 있으면 값을 반환한다", () => {
    process.env.STITCH_API_KEY = "sk-test";
    process.env.OLLAMA_MODEL = "gemma4:2b";
    expect(validateEnv()).toEqual({ stitchApiKey: "sk-test", ollamaModel: "gemma4:2b" });
  });

  it("STITCH_API_KEY 없으면 MissingEnvError를 던진다", () => {
    delete process.env.STITCH_API_KEY;
    process.env.OLLAMA_MODEL = "gemma4:2b";
    expect(() => validateEnv()).toThrow(MissingEnvError);
    expect(() => validateEnv()).toThrow("STITCH_API_KEY");
  });

  it("OLLAMA_MODEL 없으면 MissingEnvError를 던진다", () => {
    process.env.STITCH_API_KEY = "sk-test";
    delete process.env.OLLAMA_MODEL;
    expect(() => validateEnv()).toThrow(MissingEnvError);
    expect(() => validateEnv()).toThrow("OLLAMA_MODEL");
  });
});
