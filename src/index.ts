import "dotenv/config";
import { validateEnv } from "./env.js";
import { loadDesignMd } from "./design.js";
import {
  buildSystemPrompt,
  generatePageVariants,
  GenerationError,
} from "./generate.js";
import {
  buildDeterministicFolderName,
  buildDeterministicHtmlFileName,
  buildMetadataPath,
  buildProjectOutputPath,
  openInBrowser,
  saveBinary,
  saveHtml,
  saveJson,
} from "./output.js";
import {
  promptAdditionalPagesDescription,
  promptDesignName,
  promptPageDescription,
} from "./cli.js";

async function main(): Promise<void> {
  const { stitchApiKey } = validateEnv();

  const designName = await promptDesignName();
  const designMd = designName ? await loadDesignMd(designName) : null;
  const userPrompt = await promptPageDescription();
  const additionalPagesPrompt = await promptAdditionalPagesDescription();
  const systemPrompt = buildSystemPrompt(designMd);

  try {
    console.log("Generating...");

    const pages = await generatePageVariants({
      stitchApiKey,
      systemPrompt,
      userPrompt,
      additionalPagesPrompt,
      variantCount: 4,
    });
    const projectFolder = buildDeterministicFolderName(userPrompt, "project");

    const savedPaths: string[] = [];

    for (const page of pages) {
      const fileName = buildDeterministicHtmlFileName(
        `${userPrompt}\n\n${page.variantPrompt}`,
        "page"
      );
      const outputFileName =
        page.kind === "html"
          ? fileName
          : replaceFileExtension(fileName, page.imageExtension);
      const outputPath = buildProjectOutputPath(projectFolder, outputFileName);

      if (page.kind === "html") {
        await saveHtml(page.html, outputPath);
        await saveJson(
          {
            kind: "html",
            projectId: page.projectId,
            screenId: page.screenId,
            variantPrompt: page.variantPrompt,
            generatedAt: new Date().toISOString(),
          },
          buildMetadataPath(outputPath)
        );
      } else {
        await saveBinary(page.imageBytes, outputPath);
      }

      savedPaths.push(outputPath);
      console.log(`Saved ${page.kind}: ${outputPath}`);
    }

    if (savedPaths.length > 0) {
      console.log("Opening result in browser...");
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

function replaceFileExtension(fileName: string, extension: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  return `${baseName}${safeExtension}`;
}
