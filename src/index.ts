import "dotenv/config";
import { validateEnv } from "./env.js";
import { loadDesignMd } from "./design.js";
import {
  buildSystemPrompt,
  generateOutputFileName,
  generateProjectFolderName,
  generatePageVariants,
  GenerationError,
} from "./generate.js";
import { buildProjectOutputPath, openInBrowser, saveHtml } from "./output.js";
import {
  promptDesignName,
  promptPageDescription,
  promptVariantCount,
} from "./cli.js";

async function main(): Promise<void> {
  const { stitchApiKey, ollamaModel } = validateEnv();

  const designName = await promptDesignName();
  const designMd = designName ? await loadDesignMd(designName) : null;
  const userPrompt = await promptPageDescription();
  const variantCount = await promptVariantCount();
  const systemPrompt = buildSystemPrompt(designMd);

  try {
    console.log("Generating...");

    const pages = await generatePageVariants({
      stitchApiKey,
      systemPrompt,
      userPrompt,
      variantCount,
    });
    const projectFolder = await generateProjectFolderName({
      ollamaModel,
      prompt: userPrompt,
      fallbackName: "project",
    });

    const usedNames = new Set<string>();
    const savedPaths: string[] = [];

    for (const [index, page] of pages.entries()) {
      const fileName = await generateOutputFileName({
        ollamaModel,
        prompt: `${userPrompt}\n\n${page.variantPrompt}`,
        fallbackName: `page-${index + 1}`,
      });
      const outputPath = buildProjectOutputPath(
        projectFolder,
        makeVariantFileName(fileName, index + 1, usedNames)
      );
      await saveHtml(page.html, outputPath);
      savedPaths.push(outputPath);
      console.log(`Saved: ${outputPath}`);
    }

    if (savedPaths.length > 0) {
      console.log("Opening drafts in browser...");
      for (const savedPath of savedPaths) {
        await openInBrowser(savedPath);
      }
    }
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

function makeVariantFileName(
  fileName: string,
  variantIndex: number,
  usedNames: Set<string>
): string {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";
  let candidate = `${baseName}-${variantIndex}${extension}`;

  while (usedNames.has(candidate)) {
    variantIndex += 1;
    candidate = `${baseName}-${variantIndex}${extension}`;
  }

  usedNames.add(candidate);
  return candidate;
}
