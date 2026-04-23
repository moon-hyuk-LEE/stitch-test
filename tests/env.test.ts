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
  });

  it("STITCH_API_KEY가 있으면 값을 반환한다", () => {
    process.env.STITCH_API_KEY = "sk-test";
    expect(validateEnv()).toEqual({ stitchApiKey: "sk-test" });
  });

  it("STITCH_API_KEY 없으면 MissingEnvError를 던진다", () => {
    delete process.env.STITCH_API_KEY;
    expect(() => validateEnv()).toThrow(MissingEnvError);
    expect(() => validateEnv()).toThrow("STITCH_API_KEY");
  });
});
