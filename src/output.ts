import { createHash } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import open from "open";

export const RESULT_DIR = "result";

export function buildOutputPath(
  fileName: string,
  baseDir = RESULT_DIR,
  now = new Date()
): string {
  return join(buildDateFolderPath(baseDir, now), fileName);
}

export function normalizeHtmlFileName(value: string, fallback = "page"): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/\.html?$/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  const safeBase = base.length > 0 ? base : fallback;
  return `${safeBase}.html`;
}

export function normalizeFolderName(value: string, fallback = "project"): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  return base.length > 0 ? base : fallback;
}

export function buildDeterministicHtmlFileName(
  value: string,
  fallback = "page"
): string {
  return normalizeHtmlFileName(buildDeterministicHashBase(value, fallback), fallback);
}

export function buildDeterministicFolderName(
  value: string,
  fallback = "project"
): string {
  return normalizeFolderName(buildDeterministicHashBase(value, fallback), fallback);
}

export function buildDateFolderPath(baseDir = RESULT_DIR, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return join(baseDir, date);
}

export function buildProjectOutputPath(
  projectFolder: string,
  fileName: string,
  baseDir = RESULT_DIR,
  now = new Date()
): string {
  return join(buildDateFolderPath(baseDir, now), normalizeFolderName(projectFolder), fileName);
}

export function buildMetadataPath(htmlPath: string): string {
  return htmlPath.replace(/\.html?$/i, ".meta.json");
}

function buildDeterministicHashBase(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  const hash = createHash("sha1").update(trimmed || fallback).digest("hex").slice(0, 8);
  return `${fallback}-${hash}`;
}

export async function saveHtml(html: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf-8");
}

export async function saveJson(value: unknown, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export async function saveBinary(data: Uint8Array, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(data));
}

export async function scanResultHtmlFiles(baseDir = RESULT_DIR): Promise<string[]> {
  try {
    const withStats = await collectHtmlFiles(baseDir, baseDir);

    return withStats
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function collectHtmlFiles(
  baseDir: string,
  currentDir: string
): Promise<Array<{ name: string; mtimeMs: number }>> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        return await collectHtmlFiles(baseDir, fullPath);
      }

      if (!entry.isFile() || !entry.name.endsWith(".html")) {
        return [];
      }

      const fileStat = await stat(fullPath);
      return [
        {
          name: relative(baseDir, fullPath).replace(/\\/g, "/"),
          mtimeMs: fileStat.mtimeMs,
        },
      ];
    })
  );

  return files.flat();
}

export async function openInBrowser(filePath: string): Promise<void> {
  await open(`file://${resolve(filePath)}`);
}
