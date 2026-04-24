import { Project, Screen, Stitch, StitchToolClient } from "@google/stitch-sdk";

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

export type GeneratedVariant =
  | {
      kind: "html";
      variantPrompt: string;
      html: string;
      projectId: string;
      screenId: string;
    }
  | {
      kind: "image";
      variantPrompt: string;
      imageBytes: Uint8Array;
      imageMimeType: string;
      imageExtension: string;
    };

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
  additionalPagesPrompt?: string;
}): Promise<string> {
  const [first] = await generatePageVariants({
    stitchApiKey: opts.stitchApiKey,
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    additionalPagesPrompt: opts.additionalPagesPrompt ?? "",
    variantCount: 1,
  });

  if (!first) {
    throw new GenerationError("No page was generated.");
  }

  return ensureHtmlVariant(first);
}

export async function generatePageVariants(opts: {
  stitchApiKey: string;
  systemPrompt: string;
  userPrompt: string;
  additionalPagesPrompt: string;
  variantCount: number;
}): Promise<GeneratedVariant[]> {
  const prompt = buildTaskPrompt(opts.systemPrompt, "User request:", opts.userPrompt);
  return await generateHtmlVariants(
    opts.stitchApiKey,
    buildProjectTitle(opts.userPrompt),
    prompt,
    opts.additionalPagesPrompt,
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
    buildProjectTitle(opts.editPrompt),
    prompt
  );
}

async function generateHtml(
  stitchApiKey: string,
  projectTitle: string,
  prompt: string
): Promise<string> {
  const [first] = await generateHtmlVariants(stitchApiKey, projectTitle, prompt, "", 1);

  if (!first) {
    throw new GenerationError("No page was generated.");
  }

  return ensureHtmlVariant(first);
}

async function generateHtmlVariants(
  stitchApiKey: string,
  projectTitle: string,
  prompt: string,
  additionalPagesPrompt: string,
  variantCount: number
): Promise<GeneratedVariant[]> {
  const client = new StitchToolClient({ apiKey: stitchApiKey });
  const stitch = new Stitch(client);

  try {
    const project = await retryStitchOperation(
      () => stitch.createProject(projectTitle),
      "create project"
    );
    const results: GeneratedVariant[] = [];

    const mainVariantPrompt = buildVariantPrompt(prompt, 1, variantCount);
    const mainScreen = await generateScreenWithRecovery({
      client,
      project,
      variantPrompt: mainVariantPrompt,
      variantLabel: "main screen",
    });
    results.push(await loadGeneratedVariant(mainScreen, mainVariantPrompt, "main screen"));

    if (variantCount > 1) {
      const followUpPrompt = buildFollowUpPrompt(
        prompt,
        additionalPagesPrompt,
        variantCount - 1
      );
      const followUpScreens = await generateVariantScreensWithRecovery({
        client,
        project,
        sourceScreen: mainScreen,
        prompt: followUpPrompt,
        variantCount: variantCount - 1,
      });

      for (let index = 0; index < followUpScreens.length; index += 1) {
        const variantIndex = index + 2;
        const variantPrompt = buildVariantPrompt(prompt, variantIndex, variantCount);
        results.push(
          await loadGeneratedVariant(
            followUpScreens[index],
            variantPrompt,
            `screen ${variantIndex}`
          )
        );
      }
    }

    return results;
  } finally {
    await client.close();
  }
}

function buildVariantPrompt(basePrompt: string, index: number, total: number): string {
  if (index === 1) {
    return [
      basePrompt,
      "",
      `Main page of ${total}:`,
      "Create the primary page for this product. Establish the header, navigation, typography, spacing, and overall visual system that the rest of the pages should match.",
    ].join("\n");
  }

  return [
    basePrompt,
    "",
    `Additional page ${index - 1} of ${total - 1}:`,
    "Create a related follow-up page that reuses the same header, navigation, spacing scale, and visual language as the main page.",
    "Only vary the body content and page purpose. Keep the brand and shell consistent.",
  ].join("\n");
}

function buildFollowUpPrompt(
  basePrompt: string,
  additionalPagesPrompt: string,
  followUpCount: number
): string {
  return [
    basePrompt,
    "",
    "Additional pages brief:",
    additionalPagesPrompt,
    "",
    `Create ${followUpCount} additional pages that follow the main page.`,
    "Keep the same header, navigation, typography, spacing, and component style as the main page.",
    "The additional pages should feel like a connected product flow, not separate redesigns.",
    "Vary the page content and purpose, but preserve the shell and design language.",
  ].join("\n");
}

async function loadGeneratedVariant(
  screen: Screen,
  variantPrompt: string,
  label: string
): Promise<GeneratedVariant> {
  try {
    const htmlUrl = await retryStitchOperation(
      () => screen.getHtml(),
      `get html ${label}`,
      5,
      (result) => result.trim().length === 0
    );
    const html = await loadHtml(htmlUrl);
    return {
      kind: "html",
      html,
      variantPrompt,
      projectId: screen.projectId,
      screenId: screen.id,
    };
  } catch (error) {
    if (!(error instanceof GenerationError)) {
      throw error;
    }

    console.warn(`get html ${label} failed; trying image fallback.`);
    const imageUrl = await retryStitchOperation(
      () => screen.getImage(),
      `get image ${label}`,
      5,
      (result) => result.trim().length === 0
    );
    const image = await loadImage(imageUrl);
    return {
      kind: "image",
      variantPrompt,
      imageBytes: image.bytes,
      imageMimeType: image.mimeType,
      imageExtension: image.extension,
    };
  }
}

async function generateVariantScreensWithRecovery(opts: {
  client: StitchToolClient;
  project: Project;
  sourceScreen: Screen;
  prompt: string;
  variantCount: number;
}): Promise<Screen[]> {
  const beforeScreens = await opts.project.screens();
  const beforeIds = new Set(beforeScreens.map((screen) => screen.id));

  try {
    const raw = await retryStitchOperation(
      () =>
        opts.client.callTool("generate_variants", {
          projectId: opts.project.projectId,
          selectedScreenIds: [opts.sourceScreen.id],
          prompt: opts.prompt,
          variantOptions: {
            variantCount: opts.variantCount,
            creativeRange: "REFINE",
            aspects: ["LAYOUT", "TEXT_CONTENT"],
          },
          deviceType: "DESKTOP",
        }),
      "generate follow-up variants"
    );

    const recovered = extractScreensFromVariantResponse(
      opts.client,
      opts.project.projectId,
      raw
    );
    if (recovered.length > 0) {
      return recovered.slice(0, opts.variantCount);
    }
  } catch (error) {
    if (!(error instanceof Error) || !isProjectionFailure(error)) {
      throw error;
    }

    console.warn("follow-up variants projection failed; trying to recover from project screens.");
  }

  return await recoverLatestGeneratedScreens(opts.project, beforeIds, opts.variantCount);
}

function extractScreensFromVariantResponse(
  client: StitchToolClient,
  projectId: string,
  raw: unknown
): Screen[] {
  const anyRaw = raw as any;
  const projectedScreens =
    anyRaw?.outputComponents?.[1]?.design?.screens ??
    anyRaw?.outputComponents?.[0]?.design?.screens ??
    [];

  return projectedScreens.map((screen: any) => new Screen(client, { ...screen, projectId }));
}

async function recoverLatestGeneratedScreens(
  project: Project,
  beforeIds: Set<string>,
  expectedCount: number
): Promise<Screen[]> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const screens = await project.screens();
    const newest = screens.filter((screen) => !beforeIds.has(screen.id));

    if (newest.length >= expectedCount) {
      return newest.slice(0, expectedCount);
    }

    if (attempt < 5) {
      const delayMs = attempt * 1500;
      console.warn(
        `follow-up variants are not visible yet; retrying screen lookup in ${delayMs}ms (attempt ${attempt + 1}/5)`
      );
      await delay(delayMs);
    }
  }

  throw new GenerationError(
    `follow-up variants could not be recovered from Stitch after generation completed.`
  );
}

async function retryStitchOperation<T>(
  operation: () => Promise<T>,
  label: string,
  attempts = 3,
  shouldRetryResult?: (result: T) => boolean
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();

      if (shouldRetryResult?.(result)) {
        lastError = new GenerationError(`${label} returned an empty result.`);

        if (attempt === attempts) {
          throw lastError;
        }

        const delayMs = attempt * 1500;
        console.warn(
          `${label} returned an empty result; retrying in ${delayMs}ms (attempt ${attempt + 1}/${attempts})`
        );
        await delay(delayMs);
        continue;
      }

      return result;
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

async function generateScreenWithRecovery(opts: {
  client: StitchToolClient;
  project: Project;
  variantPrompt: string;
  variantLabel: string;
}): Promise<Screen> {
  const beforeScreens = await opts.project.screens();
  const beforeIds = new Set(beforeScreens.map((screen) => screen.id));

  try {
    const raw = await retryStitchOperation(
      () =>
        opts.client.callTool("generate_screen_from_text", {
          projectId: opts.project.projectId,
          prompt: opts.variantPrompt,
          deviceType: "DESKTOP",
        }),
      `generate ${opts.variantLabel}`
    );

    const recovered = extractScreenFromGenerateResponse(opts.client, opts.project.projectId, raw);
    if (recovered) {
      return recovered;
    }
  } catch (error) {
    if (!(error instanceof Error) || !isProjectionFailure(error)) {
      throw error;
    }

    console.warn(`${opts.variantLabel} projection failed; trying to recover from project screens.`);
  }

  return await recoverLatestGeneratedScreen(opts.project, beforeIds, opts.variantLabel);
}

function extractScreenFromGenerateResponse(
  client: StitchToolClient,
  projectId: string,
  raw: unknown
): Screen | null {
  const anyRaw = raw as any;
  const projected =
    anyRaw?.outputComponents?.[1]?.design?.screens?.[0] ??
    anyRaw?.outputComponents?.[0]?.design?.screens?.[0];

  if (!projected) {
    return null;
  }

  return new Screen(client, { ...projected, projectId });
}

async function recoverLatestGeneratedScreen(
  project: Project,
  beforeIds: Set<string>,
  variantLabel: string
): Promise<Screen> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const screens = await project.screens();
    const newest = screens.find((screen) => !beforeIds.has(screen.id));

    if (newest) {
      return newest;
    }

    if (attempt < 5) {
      const delayMs = attempt * 1500;
      console.warn(
        `${variantLabel} is not visible yet; retrying screen lookup in ${delayMs}ms (attempt ${attempt + 1}/5)`
      );
      await delay(delayMs);
    }
  }

  throw new GenerationError(
    `${variantLabel} could not be recovered from Stitch after generation completed.`
  );
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

function buildProjectTitle(value: string): string {
  const trimmed = value.trim();
  const words = trimmed.match(/[A-Za-z0-9]+/g)?.slice(0, 5).join(" ") ?? "";

  if (words.length > 0) {
    return words;
  }

  return "Generated Page";
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
  const trimmed = value.trim();

  if (!trimmed) {
    throw new GenerationError(
      "HTML URL이 비어 있습니다. Stitch 반환값을 확인하세요."
    );
  }

  if (looksLikeHtml(trimmed)) {
    return trimmed;
  }

  try {
    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new GenerationError(
        `HTML 다운로드에 실패했습니다. Stitch 반환값을 확인하세요. (${response.status} ${response.statusText})`
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof GenerationError) {
      throw error;
    }

    throw new GenerationError(
      "HTML URL을 불러올 수 없습니다. Stitch 반환값이 유효한 절대 URL인지 확인하세요."
    );
  }
}

async function loadImage(value: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
}> {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new GenerationError(
      "이미지 URL이 비어 있습니다. Stitch 반환값을 확인하세요."
    );
  }

  try {
    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new GenerationError(
        `이미지 다운로드에 실패했습니다. Stitch 반환값을 확인하세요. (${response.status} ${response.statusText})`
      );
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const extension = mimeTypeToExtension(mimeType);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, mimeType, extension };
  } catch (error) {
    if (error instanceof GenerationError) {
      throw error;
    }

    throw new GenerationError(
      "이미지 URL을 불러올 수 없습니다. Stitch 반환값이 유효한 절대 URL인지 확인하세요."
    );
  }
}

function ensureHtmlVariant(variant: GeneratedVariant): string {
  if (variant.kind === "html") {
    return variant.html;
  }

  throw new GenerationError(
    "Stitch returned an image fallback, but HTML output was required for this operation."
  );
}

function isProjectionFailure(error: Error): boolean {
  if (error.name !== "StitchError") {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("incomplete api response") || message.includes("projection path");
}

function mimeTypeToExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/jpg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  if (mimeType === "image/avif") return ".avif";
  return ".png";
}
