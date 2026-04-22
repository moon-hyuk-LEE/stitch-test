import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { validateEnv, MissingEnvError } from "../src/env.js";
import { scanDesigns, loadDesignMd } from "../src/design.js";
import {
  buildOutputPath,
  buildProjectOutputPath,
  saveHtml,
  scanResultHtmlFiles,
  normalizeHtmlFileName,
  normalizeFolderName,
} from "../src/output.js";
import { buildSystemPrompt } from "../src/generate.js";

const savedEnv = {
  STITCH_API_KEY: process.env.STITCH_API_KEY,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
};

type TestCase = { name: string; run: () => Promise<void> | void };

const tests: TestCase[] = [
  {
    name: "validateEnv returns stitchApiKey when present",
    run: () => {
      process.env.STITCH_API_KEY = "sk-test";
      process.env.OLLAMA_MODEL = "gemma4:2b";
      assert.deepEqual(validateEnv(), {
        stitchApiKey: "sk-test",
        ollamaModel: "gemma4:2b",
      });
    },
  },
  {
    name: "validateEnv throws when STITCH_API_KEY is missing",
    run: () => {
      delete process.env.STITCH_API_KEY;
      process.env.OLLAMA_MODEL = "gemma4:2b";
      assert.throws(() => validateEnv(), MissingEnvError);
      assert.throws(() => validateEnv(), /STITCH_API_KEY/);
    },
  },
  {
    name: "validateEnv throws when OLLAMA_MODEL is missing",
    run: () => {
      process.env.STITCH_API_KEY = "sk-test";
      delete process.env.OLLAMA_MODEL;
      assert.throws(() => validateEnv(), MissingEnvError);
      assert.throws(() => validateEnv(), /OLLAMA_MODEL/);
    },
  },
  {
    name: "scanDesigns returns directories with DESIGN.md",
    run: async () => {
      const result = await scanDesigns("tests/tmp-designs");
      assert.ok(result.includes("minimal"));
      assert.ok(result.includes("material"));
      assert.ok(!result.includes("empty-dir"));
    },
  },
  {
    name: "scanDesigns returns [] for missing dir",
    run: async () => {
      const result = await scanDesigns("nonexistent-path");
      assert.deepEqual(result, []);
    },
  },
  {
    name: "loadDesignMd returns file contents",
    run: async () => {
      const content = await loadDesignMd("minimal", "tests/tmp-designs");
      assert.equal(content, "# Minimal\nclean design");
    },
  },
  {
    name: "loadDesignMd returns null when missing",
    run: async () => {
      const originalWarn = console.warn;
      console.warn = () => {};
      try {
        const content = await loadDesignMd("nonexistent", "tests/tmp-designs");
        assert.equal(content, null);
      } finally {
        console.warn = originalWarn;
      }
    },
  },
  {
    name: "buildOutputPath uses date directory",
    run: () => {
      const path = buildOutputPath("company-data-flow.html", "tests/tmp-result", new Date("2026-04-22T00:00:00.000Z"));
      assert.equal(path.replace(/\\/g, "/"), "tests/tmp-result/2026-04-22/company-data-flow.html");
    },
  },
  {
    name: "buildProjectOutputPath nests project folder",
    run: () => {
      const path = buildProjectOutputPath(
        "company-data-flow",
        "dashboard.html",
        "tests/tmp-result",
        new Date("2026-04-22T00:00:00.000Z")
      );
      assert.equal(
        path.replace(/\\/g, "/"),
        "tests/tmp-result/2026-04-22/company-data-flow/dashboard.html"
      );
    },
  },
  {
    name: "normalizeHtmlFileName creates safe html file names",
    run: () => {
      assert.equal(normalizeHtmlFileName("Company Data Flow"), "company-data-flow.html");
      assert.equal(normalizeHtmlFileName("report.html"), "report.html");
      assert.equal(normalizeHtmlFileName(""), "page.html");
    },
  },
  {
    name: "normalizeFolderName creates safe folder names",
    run: () => {
      assert.equal(normalizeFolderName("Company Data Flow"), "company-data-flow");
      assert.equal(normalizeFolderName(""), "project");
    },
  },
  {
    name: "saveHtml writes HTML",
    run: async () => {
      const path = buildOutputPath("test-page.html", "tests/tmp-result", new Date("2026-04-22T00:00:00.000Z"));
      await saveHtml("<html><body>test</body></html>", path);
      const content = await readFile(path, "utf-8");
      assert.equal(content, "<html><body>test</body></html>");
    },
  },
  {
    name: "saveHtml creates missing directories",
    run: async () => {
      const path = `tests/tmp-result/2026-04-22/nested/output.html`;
      await saveHtml("<p>hi</p>", path);
      const content = await readFile(path, "utf-8");
      assert.equal(content, "<p>hi</p>");
    },
  },
  {
    name: "scanResultHtmlFiles returns only html files",
    run: async () => {
      await writeFile("tests/tmp-result/2026-04-22/note.txt", "ignore me");
      const files = await scanResultHtmlFiles("tests/tmp-result");
      assert.ok(files.every((file) => file.endsWith(".html")));
      assert.ok(!files.includes("2026-04-22/note.txt"));
    },
  },
  {
    name: "buildSystemPrompt uses base prompt when design is absent",
    run: () => {
      const result = buildSystemPrompt(null);
      assert.match(result, /UI designer/);
      assert.ok(!result.includes("Design System"));
    },
  },
  {
    name: "buildSystemPrompt includes design system when provided",
    run: () => {
      const result = buildSystemPrompt("# Minimal\nclean fonts");
      assert.ok(result.includes("Design System"));
      assert.ok(result.includes("# Minimal"));
      assert.ok(result.includes("clean fonts"));
    },
  },
];

async function setupFixtures(): Promise<void> {
  const tmp = "tests/tmp-designs";

  await safeRm(tmp);
  await mkdir(`${tmp}/minimal`, { recursive: true });
  await mkdir(`${tmp}/material`, { recursive: true });
  await mkdir(`${tmp}/empty-dir`, { recursive: true });
  await writeFile(`${tmp}/minimal/DESIGN.md`, "# Minimal\nclean design");
  await writeFile(`${tmp}/material/DESIGN.md`, "# Material\nbold colors");
}

async function setupOutputFixture(): Promise<void> {
  return safeRm("tests/tmp-result");
}

async function main(): Promise<void> {
  await setupFixtures();
  await setupOutputFixture();

  let failed = 0;

  for (const testCase of tests) {
    try {
      await testCase.run();
      console.log(`✓ ${testCase.name}`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${testCase.name}`);
      console.error(error);
    }
  }

  await safeRm("tests/tmp-designs");
  await safeRm("tests/tmp-result");

  process.env.STITCH_API_KEY = savedEnv.STITCH_API_KEY;
  process.env.OLLAMA_MODEL = savedEnv.OLLAMA_MODEL;

  if (failed > 0) {
    process.exitCode = 1;
    console.error(`${failed} test(s) failed`);
  } else {
    console.log(`${tests.length} test(s) passed`);
  }
}

async function safeRm(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // Cleanup failures on Windows sandbox are non-fatal.
  }
}

await main();
