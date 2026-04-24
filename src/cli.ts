import { input, select } from "@inquirer/prompts";
import { scanResultHtmlFiles } from "./output.js";
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
    validate: (value) =>
      value.trim().length > 0 || "Description cannot be empty",
  });
}

export async function promptAdditionalPagesDescription(): Promise<string> {
  return input({
    message: "Describe the additional pages:",
    validate: (value) =>
      value.trim().length > 0 || "Description cannot be empty",
  });
}

export async function promptEditDescription(): Promise<string> {
  return input({
    message: "Describe the edit:",
    validate: (value) =>
      value.trim().length > 0 || "Description cannot be empty",
  });
}

export async function promptResultHtmlFile(): Promise<string> {
  const files = await scanResultHtmlFiles();

  if (files.length === 0) {
    throw new Error("No result HTML files were found. Generate one first with `npm run stitch`.");
  }

  return await select({
    message: "Select result HTML file to edit:",
    choices: files.map((name) => ({ name, value: name })),
  });
}
