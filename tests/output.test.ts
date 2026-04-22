import { describe, it, expect, afterEach } from "vitest";
import { readFile, rm } from "node:fs/promises";
import {
  buildOutputPath,
  buildProjectOutputPath,
  saveHtml,
  normalizeHtmlFileName,
  normalizeFolderName,
} from "../src/output.js";

const TMP_DIR = "tests/tmp-result";

afterEach(async () => {
  await rm(TMP_DIR, { recursive: true, force: true });
});

describe("buildOutputPath", () => {
  it("YYYY-MM-DD/file.html 형식의 경로를 반환한다", () => {
    const path = buildOutputPath("dashboard.html", TMP_DIR, new Date("2026-04-22T00:00:00.000Z"));
    expect(path.replace(/\\/g, "/")).toBe("tests/tmp-result/2026-04-22/dashboard.html");
  });
});

describe("normalizeHtmlFileName", () => {
  it("프롬프트 기반 문자열을 안전한 html 파일명으로 바꾼다", () => {
    expect(normalizeHtmlFileName("Company Data Flow")).toBe("company-data-flow.html");
    expect(normalizeHtmlFileName("report.html")).toBe("report.html");
    expect(normalizeHtmlFileName("")).toBe("page.html");
  });
});

describe("normalizeFolderName", () => {
  it("프로젝트 폴더명을 안전한 디렉터리명으로 바꾼다", () => {
    expect(normalizeFolderName("Company Data Flow")).toBe("company-data-flow");
    expect(normalizeFolderName("")).toBe("project");
  });
});

describe("buildProjectOutputPath", () => {
  it("YYYY-MM-DD/project/file.html 형식의 경로를 반환한다", () => {
    const path = buildProjectOutputPath(
      "company-data-flow",
      "dashboard.html",
      "tests/tmp-result",
      new Date("2026-04-22T00:00:00.000Z")
    );
    expect(path.replace(/\\/g, "/")).toBe(
      "tests/tmp-result/2026-04-22/company-data-flow/dashboard.html"
    );
  });
});

describe("saveHtml", () => {
  it("HTML을 파일로 저장한다", async () => {
    const path = buildOutputPath("test-page.html", TMP_DIR, new Date("2026-04-22T00:00:00.000Z"));
    await saveHtml("<html><body>test</body></html>", path);
    const content = await readFile(path, "utf-8");
    expect(content).toBe("<html><body>test</body></html>");
  });

  it("result 디렉토리가 없어도 자동 생성한다", async () => {
    const path = `${TMP_DIR}/nested/output.html`;
    await saveHtml("<p>hi</p>", path);
    const content = await readFile(path, "utf-8");
    expect(content).toBe("<p>hi</p>");
  });
});
