import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { scanDesigns, loadDesignMd } from "../src/design.js";

const TMP = "tests/tmp-designs";

beforeEach(async () => {
  await mkdir(`${TMP}/minimal`, { recursive: true });
  await mkdir(`${TMP}/material`, { recursive: true });
  await mkdir(`${TMP}/empty-dir`, { recursive: true });
  await writeFile(`${TMP}/minimal/DESIGN.md`, "# Minimal\nclean design");
  await writeFile(`${TMP}/material/DESIGN.md`, "# Material\nbold colors");
  // empty-dir has no DESIGN.md
});

afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("scanDesigns", () => {
  it("DESIGN.md가 있는 디렉토리 이름만 반환한다", async () => {
    const result = await scanDesigns(TMP);
    expect(result).toContain("minimal");
    expect(result).toContain("material");
    expect(result).not.toContain("empty-dir");
  });

  it("디렉토리가 없으면 빈 배열을 반환한다", async () => {
    const result = await scanDesigns("nonexistent-path");
    expect(result).toEqual([]);
  });
});

describe("loadDesignMd", () => {
  it("DESIGN.md 내용을 반환한다", async () => {
    const content = await loadDesignMd("minimal", TMP);
    expect(content).toBe("# Minimal\nclean design");
  });

  it("파일이 없으면 null을 반환한다", async () => {
    const content = await loadDesignMd("nonexistent", TMP);
    expect(content).toBeNull();
  });
});
