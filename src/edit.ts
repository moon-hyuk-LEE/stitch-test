import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Stitch, StitchToolClient } from "@google/stitch-sdk";
import { validateEnv } from "./env.js";
import { loadDesignMd } from "./design.js";
import {
  buildSystemPrompt,
  generateEditedPage,
  GenerationError,
} from "./generate.js";
import {
  buildDeterministicHtmlFileName,
  buildMetadataPath,
  buildOutputPath,
  openInBrowser,
  saveHtml,
} from "./output.js";
import { promptDesignName, promptEditDescription, promptResultHtmlFile } from "./cli.js";

type ResultMetadata = {
  projectId: string;
  screenId: string;
};

async function main(): Promise<void> {
  const { stitchApiKey } = validateEnv();

  const designName = await promptDesignName();
  const designMd = designName ? await loadDesignMd(designName) : null;
  const selectedFile = await promptResultHtmlFile();
  const htmlPath = join("result", selectedFile);
  const editPrompt = await promptEditDescription();

  try {
    console.log("Editing...");

    const metadata = await loadResultMetadata(buildMetadataPath(htmlPath));
    let html: string;

    if (metadata) {
      html = await editExistingScreen({
        stitchApiKey,
        projectId: metadata.projectId,
        screenId: metadata.screenId,
        editPrompt: buildEditPrompt(designMd, editPrompt),
      });
    } else {
      html = await editLegacyHtml({
        stitchApiKey,
        designMd,
        htmlPath,
        editPrompt,
      });
    }

    const fileName = buildDeterministicHtmlFileName(editPrompt, "edit");
    const outputPath = buildOutputPath(fileName);
    await saveHtml(html, outputPath);

    console.log(`Saved: ${outputPath}`);
    console.log("Opening in browser...");
    await openInBrowser(outputPath);
  } catch (error) {
    if (error instanceof GenerationError) {
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

function buildEditPrompt(designMd: string | null, editPrompt: string): string {
  return [
    buildSystemPrompt(designMd),
    "",
    "You are editing an existing HTML page.",
    "Preserve the existing header, navigation, spacing scale, and component language unless the user explicitly asks otherwise.",
    "Make the smallest change that satisfies the request.",
    "",
    "Edit request:",
    editPrompt,
  ].join("\n");
}

async function editExistingScreen(opts: {
  stitchApiKey: string;
  projectId: string;
  screenId: string;
  editPrompt: string;
}): Promise<string> {
  const client = new StitchToolClient({ apiKey: opts.stitchApiKey });
  const stitch = new Stitch(client);

  try {
    const project = stitch.project(opts.projectId);
    const screen = await project.getScreen(opts.screenId);
    const edited = await screen.edit(opts.editPrompt, "DESKTOP");
    return await edited.getHtml();
  } finally {
    await client.close();
  }
}

async function editLegacyHtml(opts: {
  stitchApiKey: string;
  designMd: string | null;
  htmlPath: string;
  editPrompt: string;
}): Promise<string> {
  const baseHtml = await readFile(opts.htmlPath, "utf-8");
  const systemPrompt = [
    buildSystemPrompt(opts.designMd),
    "",
    "You are editing an existing HTML page.",
    "Preserve useful structure and make only the requested changes.",
  ].join("\n");

  console.warn(
    "No edit metadata was found for the selected HTML file. Falling back to legacy HTML-based editing."
  );

  return await generateEditedPage({
    stitchApiKey: opts.stitchApiKey,
    systemPrompt,
    baseHtml,
    editPrompt: opts.editPrompt,
  });
}

async function loadResultMetadata(metadataPath: string): Promise<ResultMetadata | null> {
  try {
    const raw = await readFile(metadataPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ResultMetadata>;

    if (
      typeof parsed.projectId === "string" &&
      parsed.projectId.length > 0 &&
      typeof parsed.screenId === "string" &&
      parsed.screenId.length > 0
    ) {
      return {
        projectId: parsed.projectId,
        screenId: parsed.screenId,
      };
    }
  } catch {
    // Missing or invalid metadata falls back to the legacy HTML flow.
  }

  return null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
