import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/generate.js";

describe("buildSystemPrompt", () => {
  it("design.md가 없으면 기본 프롬프트만 반환한다", () => {
    const result = buildSystemPrompt(null);
    expect(result).toContain("UI designer");
    expect(result).not.toContain("Design System");
  });

  it("design.md가 있으면 내용을 포함한다", () => {
    const result = buildSystemPrompt("# Minimal\nclean fonts");
    expect(result).toContain("Design System");
    expect(result).toContain("# Minimal");
    expect(result).toContain("clean fonts");
  });
});
