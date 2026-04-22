import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateEnv } from "./env.js";
import { loadDesignMd } from "./design.js";
import {
  buildSystemPrompt,
  generateEditedPage,
  generateOutputFileName,
  GenerationError,
} from "./generate.js";
import { buildOutputPath, openInBrowser, saveHtml } from "./output.js";
import { promptDesignName, promptEditDescription, promptResultHtmlFile } from "./cli.js";

async function main(): Promise<void> {
  const { stitchApiKey, ollamaModel } = validateEnv();

  const designName = await promptDesignName();
  const designMd = designName ? await loadDesignMd(designName) : null;
  const selectedFile = await promptResultHtmlFile();
  const baseHtml = await readFile(join("result", selectedFile), "utf-8");
  const editPrompt = await promptEditDescription();
  const systemPrompt = [
    buildSystemPrompt(designMd),
    "",
    "You are editing an existing HTML page.",
    "Preserve useful structure and make only the requested changes.",
  ].join("\n");

  try {
    console.log("Editing...");

    const html = await generateEditedPage({
      stitchApiKey,
      systemPrompt,
      baseHtml,
      editPrompt,
    });

    const fileName = await generateOutputFileName({
      ollamaModel,
      prompt: editPrompt,
      fallbackName: "edit",
    });
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
