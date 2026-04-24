import { describe, it, expect, afterEach } from "vitest";
import { readFile, rm } from "node:fs/promises";
import {
  buildOutputPath,
  buildProjectOutputPath,
  buildMetadataPath,
  buildDeterministicHtmlFileName,
  buildDeterministicFolderName,
  saveHtml,
  saveJson,
  saveBinary,
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

describe("buildDeterministicHtmlFileName", () => {
  it("프롬프트 기반의 안정적인 파일명을 만든다", () => {
    expect(buildDeterministicHtmlFileName("남성 옷 파는 쇼핑몰", "page")).toMatch(
      /^page-[0-9a-f]{8}\.html$/
    );
  });
});

describe("buildDeterministicFolderName", () => {
  it("프롬프트 기반의 안정적인 폴더명을 만든다", () => {
    expect(buildDeterministicFolderName("남성 옷 파는 쇼핑몰", "project")).toMatch(
      /^project-[0-9a-f]{8}$/
    );
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

describe("saveBinary", () => {
  it("바이너리 데이터를 파일로 저장한다", async () => {
    const path = buildOutputPath("test-image.png", TMP_DIR, new Date("2026-04-22T00:00:00.000Z"));
    const data = new Uint8Array([137, 80, 78, 71]);
    await saveBinary(data, path);
    const content = await readFile(path);
    expect(Array.from(content)).toEqual([137, 80, 78, 71]);
  });
});

describe("buildMetadataPath", () => {
  it("html 확장자를 meta.json으로 바꾼다", () => {
    expect(buildMetadataPath("tests/tmp-result/2026-04-22/page.html")).toBe(
      "tests/tmp-result/2026-04-22/page.meta.json"
    );
  });
});

describe("saveJson", () => {
  it("JSON을 파일로 저장한다", async () => {
    const path = `${TMP_DIR}/meta.json`;
    await saveJson({ projectId: "p1" }, path);
    const content = await readFile(path, "utf-8");
    expect(content).toContain('"projectId": "p1"');
  });
});
