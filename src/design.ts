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
