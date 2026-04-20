# Stitch + Gemma 4 HTML Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run stitch` 실행 시 CLI에서 design system과 프롬프트를 입력하면, Ollama의 Gemma 4가 Stitch SDK 도구를 자율 호출해 HTML 파일을 `result/`에 저장하고 브라우저로 여는 스크립트를 만든다.

**Architecture:** Vercel AI SDK의 `generateText()`에 `ollama-ai-provider`와 `stitchTools()`를 연결해 Gemma 4가 Stitch 도구를 자율 호출한다. `designs/{name}/DESIGN.md`를 system prompt에 주입해 디자인 일관성을 높인다. 생성된 HTML은 타임스탬프 파일명으로 `result/`에 저장한다.

**Tech Stack:** TypeScript, tsx, vitest, `@google/stitch-sdk`, `ai`, `ollama-ai-provider`, `@inquirer/prompts`, `open`, `dotenv`

---

### Task 1: 프로젝트 초기 설정

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "stitch-test",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "stitch": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@google/stitch-sdk": "latest",
    "@inquirer/prompts": "^7.0.0",
    "ai": "^4.0.0",
    "dotenv": "^16.0.0",
    "ollama-ai-provider": "^0.16.0",
    "open": "^10.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: tsconfig.json 작성**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: .env.example 작성**

```
STITCH_API_KEY=your_stitch_api_key_here
OLLAMA_MODEL=gemma4:2b
```

- [ ] **Step 4: .gitignore 작성**

```
node_modules/
dist/
.env
result/
```

- [ ] **Step 5: 의존성 설치**

```bash
npm install
```

Expected: `node_modules/` 생성, 설치 오류 없음

- [ ] **Step 6: 커밋**

```bash
git init
git add package.json tsconfig.json .env.example .gitignore
git commit -m "chore: initial project setup"
```

---

### Task 2: 환경변수 검증 (`src/env.ts`)

**Files:**
- Create: `src/env.ts`
- Create: `tests/env.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/env.test.ts`:
```typescript
import { describe, it, expect, afterEach } from "vitest";
import { validateEnv, MissingEnvError } from "../src/env.js";

describe("validateEnv", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env.STITCH_API_KEY = saved.STITCH_API_KEY;
    process.env.OLLAMA_MODEL = saved.OLLAMA_MODEL;
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test -- tests/env.test.ts
```

Expected: FAIL — `Cannot find module '../src/env.js'`

- [ ] **Step 3: 구현**

`src/env.ts`:
```typescript
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm test -- tests/env.test.ts
```

Expected: PASS 3/3

- [ ] **Step 5: 커밋**

```bash
git add src/env.ts tests/env.test.ts
git commit -m "feat: add environment variable validation"
```

---

### Task 3: Design system 로더 (`src/design.ts`)

**Files:**
- Create: `src/design.ts`
- Create: `tests/design.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/design.test.ts`:
```typescript
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test -- tests/design.test.ts
```

Expected: FAIL — `Cannot find module '../src/design.js'`

- [ ] **Step 3: 구현**

`src/design.ts`:
```typescript
import { readdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";

export async function scanDesigns(baseDir = "designs"): Promise<string[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());

    const results = await Promise.all(
      dirs.map(async (dir) => {
        try {
          await access(join(baseDir, dir.name, "DESIGN.md"));
          return dir.name;
        } catch {
          return null;
        }
      })
    );

    return results.filter((name): name is string => name !== null);
  } catch {
    return [];
  }
}

export async function loadDesignMd(
  name: string,
  baseDir = "designs"
): Promise<string | null> {
  try {
    return await readFile(join(baseDir, name, "DESIGN.md"), "utf-8");
  } catch {
    console.warn(`Warning: Could not read ${baseDir}/${name}/DESIGN.md — proceeding without design system.`);
    return null;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm test -- tests/design.test.ts
```

Expected: PASS 4/4

- [ ] **Step 5: 커밋**

```bash
git add src/design.ts tests/design.test.ts
git commit -m "feat: add design system loader"
```

---

### Task 4: 출력 핸들러 (`src/output.ts`)

**Files:**
- Create: `src/output.ts`
- Create: `tests/output.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/output.test.ts`:
```typescript
import { describe, it, expect, afterEach } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { buildOutputPath, saveHtml } from "../src/output.js";

const TMP_DIR = "tests/tmp-result";

afterEach(async () => {
  await rm(TMP_DIR, { recursive: true, force: true });
});

describe("buildOutputPath", () => {
  it("YYYY-MM-DD_HHmmss.html 형식의 경로를 반환한다", () => {
    const path = buildOutputPath(TMP_DIR);
    expect(path).toMatch(/tests\/tmp-result\/\d{4}-\d{2}-\d{2}_\d{6}\.html$/);
  });
});

describe("saveHtml", () => {
  it("HTML을 파일로 저장한다", async () => {
    const path = buildOutputPath(TMP_DIR);
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
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test -- tests/output.test.ts
```

Expected: FAIL — `Cannot find module '../src/output.js'`

- [ ] **Step 3: 구현**

`src/output.ts`:
```typescript
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import open from "open";

export const RESULT_DIR = "result";

export function buildOutputPath(baseDir = RESULT_DIR): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  return join(baseDir, `${date}_${time}.html`);
}

export async function saveHtml(html: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf-8");
}

export async function openInBrowser(filePath: string): Promise<void> {
  await open(`file://${resolve(filePath)}`);
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm test -- tests/output.test.ts
```

Expected: PASS 3/3

- [ ] **Step 5: 커밋**

```bash
git add src/output.ts tests/output.test.ts
git commit -m "feat: add HTML output handler"
```

---

### Task 5: 제너레이터 (`src/generate.ts`)

**Files:**
- Create: `src/generate.ts`
- Create: `tests/generate.test.ts`

> Note: `generatePage()`는 실제 Ollama와 Stitch API 호출이 필요하므로 unit test 대상에서 제외한다. `buildSystemPrompt()`만 테스트한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/generate.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/generate.js";

describe("buildSystemPrompt", () => {
  it("design.md가 없으면 기본 프롬프트만 반환한다", () => {
    const result = buildSystemPrompt(null);
    expect(result).toContain("UI");
    expect(result).not.toContain("Design System");
  });

  it("design.md가 있으면 내용을 포함한다", () => {
    const result = buildSystemPrompt("# Minimal\nclean fonts");
    expect(result).toContain("Design System");
    expect(result).toContain("# Minimal");
    expect(result).toContain("clean fonts");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test -- tests/generate.test.ts
```

Expected: FAIL — `Cannot find module '../src/generate.js'`

- [ ] **Step 3: 구현**

`src/generate.ts`:
```typescript
import { generateText } from "ai";
import { ollama } from "ollama-ai-provider";
import { stitchTools } from "@google/stitch-sdk/ai";

const BASE_SYSTEM = `You are a UI designer building web pages with Stitch tools.
Use the available tools to: first create a project, then generate a screen based on the user's description.
Always call generate_screen to produce the final HTML output.`;

export function buildSystemPrompt(designMd: string | null): string {
  if (!designMd) return BASE_SYSTEM;
  return `${BASE_SYSTEM}\n\n# Design System\nApply the following design system strictly:\n\n${designMd}`;
}

export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

export async function generatePage(opts: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const result = await generateText({
    model: ollama(opts.model),
    tools: stitchTools(),
    system: opts.systemPrompt,
    prompt: opts.userPrompt,
    maxSteps: 10,
  });

  // stitchTools()의 generate_screen 결과에서 HTML 추출
  for (const step of result.steps) {
    for (const toolResult of (step.toolResults ?? [])) {
      if (toolResult.toolName === "generate_screen") {
        const html = extractHtml(toolResult.result);
        if (html) return html;
      }
    }
  }

  throw new GenerationError(
    "HTML이 생성되지 않았습니다. Gemma 4가 generate_screen 도구를 호출하지 않았습니다."
  );
}

function extractHtml(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;

  // @google/stitch-sdk가 반환할 수 있는 형태 순서대로 시도
  if (typeof r.html === "string") return r.html;
  if (typeof r.htmlContent === "string") return r.htmlContent;
  if (typeof r.content === "string" && r.content.includes("<")) return r.content;

  return null;
}
```

> **중요:** `extractHtml()`의 필드명은 `@google/stitch-sdk` 실제 반환값에 따라 조정이 필요할 수 있다. `npm run stitch` 첫 실행 시 `generate_screen` tool result를 콘솔에 출력해 확인한다 (Task 7 참조).

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm test -- tests/generate.test.ts
```

Expected: PASS 2/2

- [ ] **Step 5: 커밋**

```bash
git add src/generate.ts tests/generate.test.ts
git commit -m "feat: add Gemma 4 + Stitch page generator"
```

---

### Task 6: CLI 프롬프트 (`src/cli.ts`)

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: 구현**

`src/cli.ts`:
```typescript
import { select, input } from "@inquirer/prompts";
import { scanDesigns } from "./design.js";

export async function promptDesignName(): Promise<string | null> {
  const designs = await scanDesigns();

  const choices = [
    ...designs.map((name) => ({ name, value: name })),
    { name: "(none)", value: "__none__" },
  ];

  const selected = await select({
    message: "Select design system:",
    choices,
  });

  return selected === "__none__" ? null : selected;
}

export async function promptPageDescription(): Promise<string> {
  return input({
    message: "Describe the page:",
    validate: (val) => val.trim().length > 0 || "Description cannot be empty",
  });
}
```

- [ ] **Step 2: 타입 오류 없는지 확인**

```bash
npx tsc --noEmit
```

Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add src/cli.ts
git commit -m "feat: add CLI prompts"
```

---

### Task 7: 메인 엔트리 (`src/index.ts`)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: 구현**

`src/index.ts`:
```typescript
import "dotenv/config";
import ora from "ora";
import { validateEnv } from "./env.js";
import { loadDesignMd } from "./design.js";
import { buildSystemPrompt, generatePage, GenerationError } from "./generate.js";
import { buildOutputPath, saveHtml, openInBrowser } from "./output.js";
import { promptDesignName, promptPageDescription } from "./cli.js";

async function main(): Promise<void> {
  const { ollamaModel } = validateEnv();

  const designName = await promptDesignName();
  const designMd = designName ? await loadDesignMd(designName) : null;
  const userPrompt = await promptPageDescription();

  const systemPrompt = buildSystemPrompt(designMd);

  const spinner = ora("Generating...").start();

  try {
    const html = await generatePage({
      model: ollamaModel,
      systemPrompt,
      userPrompt,
    });

    const outputPath = buildOutputPath();
    await saveHtml(html, outputPath);

    spinner.succeed(`Saved: ${outputPath}`);
    console.log("Opening in browser...");
    await openInBrowser(outputPath);
  } catch (err) {
    spinner.fail("Generation failed.");

    if (err instanceof GenerationError) {
      console.error(err.message);
    } else if (err instanceof Error && err.message.includes("ECONNREFUSED")) {
      console.error("Ollama 서버에 연결할 수 없습니다. `ollama serve`가 실행 중인지 확인하세요.");
    } else {
      console.error(err);
    }

    process.exit(1);
  }
}

main();
```

> `ora`를 spinner로 사용한다. `package.json` dependencies에 추가한다:
> ```bash
> npm install ora
> ```

- [ ] **Step 2: ora 패키지 설치**

```bash
npm install ora
```

- [ ] **Step 3: 전체 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 오류 없음. 오류 발생 시 해당 파일의 타입 오류를 수정한다.

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
npm test
```

Expected: PASS (env: 3, design: 4, output: 3, generate: 2)

- [ ] **Step 5: 커밋**

```bash
git add src/index.ts package.json package-lock.json
git commit -m "feat: add main entry point and orchestration"
```

---

### Task 8: 샘플 design 추가 및 동작 검증

**Files:**
- Create: `designs/minimal/DESIGN.md`

- [ ] **Step 1: 샘플 DESIGN.md 작성**

`designs/minimal/DESIGN.md`:
```markdown
# Minimal Design System

## Colors
- Background: #ffffff
- Text: #111111
- Accent: #2563eb
- Border: #e5e7eb

## Typography
- Font: Inter, system-ui, sans-serif
- Base size: 16px
- Heading: bold, 1.5–2.5rem
- Body: regular, 1rem, line-height 1.6

## Spacing
- Base unit: 8px
- Section padding: 32px
- Card padding: 24px

## Components
- Buttons: rounded-md, solid accent background, white text
- Cards: white background, 1px border, 8px border-radius, subtle shadow
- Layout: max-width 1200px, centered
```

- [ ] **Step 2: .env 파일 생성**

```bash
cp .env.example .env
# .env를 열어 실제 STITCH_API_KEY와 OLLAMA_MODEL 값을 입력
```

- [ ] **Step 3: Ollama에 모델이 있는지 확인**

```bash
ollama list
```

Expected: `.env`의 `OLLAMA_MODEL` 값과 일치하는 모델이 목록에 있어야 함. 없으면:
```bash
ollama pull gemma4:2b
```

- [ ] **Step 4: 실행 테스트**

```bash
npm run stitch
```

1. design 목록에서 `minimal` 선택
2. 페이지 설명 입력 (예: `A simple landing page for a coffee shop`)
3. 생성 완료 후 `result/` 에 `.html` 파일 생성 확인
4. 브라우저 자동 오픈 확인

- [ ] **Step 5: tool result 구조 확인 (필요시)**

`generate_screen` tool result에서 HTML 추출이 실패하면, `src/generate.ts`의 `generatePage()`에 임시 디버그 출력을 추가한다:

```typescript
// generatePage() 내부, for 루프 전에 추가
console.debug("Tool results:", JSON.stringify(result.steps.map(s => ({
  toolCalls: s.toolCalls?.map(t => t.toolName),
  toolResults: s.toolResults?.map(t => ({ name: t.toolName, result: t.result }))
})), null, 2));
```

출력된 구조를 확인해 `extractHtml()`의 필드명을 맞게 수정한다.

- [ ] **Step 6: 커밋**

```bash
git add designs/minimal/DESIGN.md
git commit -m "chore: add minimal sample design system"
```
