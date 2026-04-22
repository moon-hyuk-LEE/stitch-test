import { generateText } from "ai";
import { Stitch, StitchToolClient } from "@google/stitch-sdk";
import { ollama } from "ollama-ai-provider";
import { buildOutputFileNameFromText, normalizeFolderName } from "./output.js";

const BASE_SYSTEM_PROMPT = [
  "You are a UI designer that builds a single web page.",
  "Create one focused dashboard screen from the user's request.",
  "Make the layout feel complete, responsive, and production-ready.",
  "If a design system is provided, follow it strictly.",
].join(" ");

export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

export function buildSystemPrompt(designMd: string | null): string {
  if (!designMd) {
    return BASE_SYSTEM_PROMPT;
  }

  return `${BASE_SYSTEM_PROMPT}\n\n# Design System\n${designMd}`;
}

export function buildTaskPrompt(
  systemPrompt: string,
  taskLabel: string,
  userPrompt: string
): string {
  return [systemPrompt, "", taskLabel, userPrompt]
    .filter((part) => part.trim().length > 0)
    .join("\n");
}

export async function generatePage(opts: {
  stitchApiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const [first] = await generatePageVariants({
    stitchApiKey: opts.stitchApiKey,
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    variantCount: 1,
  });

  if (!first) {
    throw new GenerationError("No page was generated.");
  }

  return first.html;
}

export async function generatePageVariants(opts: {
  stitchApiKey: string;
  systemPrompt: string;
  userPrompt: string;
  variantCount: number;
}): Promise<Array<{ html: string; variantPrompt: string }>> {
  const prompt = buildTaskPrompt(opts.systemPrompt, "User request:", opts.userPrompt);
  return await generateHtmlVariants(
    opts.stitchApiKey,
    "Company data flow dashboard",
    prompt,
    opts.variantCount
  );
}

export async function generateEditedPage(opts: {
  stitchApiKey: string;
  systemPrompt: string;
  baseHtml: string;
  editPrompt: string;
}): Promise<string> {
  const prompt = [
    opts.systemPrompt,
    "",
    "Reference HTML:",
    opts.baseHtml,
    "",
    "Edit request:",
    opts.editPrompt,
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n");

  return await generateHtml(
    opts.stitchApiKey,
    "Company data flow dashboard edit",
    prompt
  );
}

export async function generateOutputFileName(opts: {
  ollamaModel: string;
  prompt: string;
  fallbackName?: string;
}): Promise<string> {
  try {
    const result = await generateText({
      model: ollama(opts.ollamaModel),
      prompt: [
        "Create a short lowercase HTML filename based on this request.",
        "Return only the filename body without extension, spaces, punctuation, or markdown.",
        "Use kebab-case and keep it concise.",
        "",
        `Request: ${opts.prompt}`,
      ].join("\n"),
    });

    const text = result.text.trim();
    return buildOutputFileNameFromText(text, opts.fallbackName ?? "page");
  } catch (error) {
    console.warn("Filename generation with Gemma failed. Falling back to a generic name.");
    if (error instanceof Error) {
      console.warn(error.message);
    }

    return buildOutputFileNameFromText(opts.fallbackName ?? "page", opts.fallbackName ?? "page");
  }
}

export async function generateProjectFolderName(opts: {
  ollamaModel: string;
  prompt: string;
  fallbackName?: string;
}): Promise<string> {
  const fileName = await generateOutputFileName({
    ollamaModel: opts.ollamaModel,
    prompt: opts.prompt,
    fallbackName: opts.fallbackName ?? "project",
  });

  return normalizeFolderName(stripHtmlExtension(fileName), opts.fallbackName ?? "project");
}

async function generateHtml(
  stitchApiKey: string,
  projectTitle: string,
  prompt: string
): Promise<string> {
  const [first] = await generateHtmlVariants(stitchApiKey, projectTitle, prompt, 1);

  if (!first) {
    throw new GenerationError("No page was generated.");
  }

  return first.html;
}

async function generateHtmlVariants(
  stitchApiKey: string,
  projectTitle: string,
  prompt: string,
  variantCount: number
): Promise<Array<{ html: string; variantPrompt: string }>> {
  const client = new StitchToolClient({ apiKey: stitchApiKey });
  const stitch = new Stitch(client);

  try {
    const project = await retryStitchOperation(
      () => stitch.createProject(projectTitle),
      "create project"
    );
    const results: Array<{ html: string; variantPrompt: string }> = [];

    for (let index = 0; index < variantCount; index += 1) {
      const variantPrompt = buildVariantPrompt(prompt, index + 1, variantCount);
      const screen = await retryStitchOperation(
        () => project.generate(variantPrompt, "DESKTOP"),
        `generate screen ${index + 1}`
      );
      const htmlUrl = await retryStitchOperation(() => screen.getHtml(), `get html ${index + 1}`);
      const html = await loadHtml(htmlUrl);
      results.push({ html, variantPrompt });
    }

    return results;
  } finally {
    await client.close();
  }
}

function buildVariantPrompt(basePrompt: string, index: number, total: number): string {
  return [
    basePrompt,
    "",
    `Draft ${index} of ${total}:`,
    "Make this a distinct, production-ready variation while preserving the same requirements.",
  ].join("\n");
}

async function retryStitchOperation<T>(
  operation: () => Promise<T>,
  label: string,
  attempts = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === attempts || !isTransientStitchError(error)) {
        throw error;
      }

      const delayMs = attempt * 1500;
      console.warn(`${label} failed; retrying in ${delayMs}ms (attempt ${attempt + 1}/${attempts})`);
      await delay(delayMs);
    }
  }

  throw lastError;
}

function isTransientStitchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("currently unavailable") ||
    message.includes("tool call failed") ||
    message.includes("service unavailable") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtmlExtension(fileName: string): string {
  return fileName.replace(/\.html?$/i, "");
}

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trimStart();
  return (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<")
  );
}

async function loadHtml(value: string): Promise<string> {
  if (looksLikeHtml(value)) {
    return value;
  }

  const response = await fetch(value);
  if (!response.ok) {
    throw new GenerationError(
      `HTML 다운로드에 실패했습니다. Stitch 반환값을 확인하세요. (${response.status} ${response.statusText})`
    );
  }

  return await response.text();
}
