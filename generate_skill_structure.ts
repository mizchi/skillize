import * as fs from "node:fs/promises";
import * as path from "node:path";

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warning: (msg: string) => console.warn(`[WARN] ${msg}`),
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function* walkFiles(dir: string, exts?: string[]): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath, exts);
    } else if (entry.isFile()) {
      if (exts) {
        const ext = path.extname(entry.name);
        if (!exts.some((e) => ext === e || ext === `.${e}`)) continue;
      }
      yield fullPath;
    }
  }
}

/**
 * Normalize skill name to comply with agentskills.io specification:
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 * - No consecutive hyphens
 */
function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateSkillMd(skillName: string): string {
  const normalizedName = normalizeSkillName(skillName);
  return `---
name: ${normalizedName}
description: ${skillName} documentation assistant. Provides access to ${skillName} documentation and guides.
---

# ${skillName} Skill

This skill provides access to ${skillName} documentation.

## Usage

1. Search or read files in \`references/\` for relevant information
2. Run \`scripts/cli.ts search <query>\` to search documentation
3. Each file has frontmatter with \`source_url\` and \`fetched_at\`
4. Always cite the source URL in responses
`;
}

export async function generateSkillStructure(
  skillName: string,
  sourceDir: string | undefined,
  outputBase: string = ".claude/skills",
  templateDir?: string
): Promise<void> {
  const normalizedName = normalizeSkillName(skillName);
  const skillDir = path.join(outputBase, normalizedName);
  const referencesDir = path.join(skillDir, "references");
  const scriptsDir = path.join(skillDir, "scripts");

  if (await exists(skillDir)) {
    logger.warning(`Skill directory ${skillDir} already exists.`);
  }

  await fs.mkdir(referencesDir, { recursive: true });
  await fs.mkdir(scriptsDir, { recursive: true });

  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!(await exists(skillMdPath))) {
    await fs.writeFile(skillMdPath, generateSkillMd(skillName));
    logger.info(`Created ${skillMdPath}`);
  }

  // Copy cli.ts template to scripts/
  if (templateDir) {
    const cliTemplate = path.join(templateDir, "cli.ts");
    const cliDst = path.join(scriptsDir, "cli.ts");
    if (await exists(cliTemplate)) {
      await fs.copyFile(cliTemplate, cliDst);
      logger.info(`Created ${cliDst}`);
    }
  }

  if (sourceDir && (await exists(sourceDir))) {
    logger.info(`Copying files from ${sourceDir}...`);
    let fileCount = 0;

    for await (const filePath of walkFiles(sourceDir, [".md"])) {
      const fileName = path.basename(filePath);
      const dstPath = path.join(referencesDir, fileName);
      const absDstPath = path.resolve(dstPath);
      const absReferencesDir = path.resolve(referencesDir);

      if (!absDstPath.startsWith(absReferencesDir)) {
        logger.warning(`Skipping potential path traversal file: ${fileName}`);
        continue;
      }

      await fs.copyFile(filePath, dstPath);
      fileCount++;
    }

    logger.info(`Copied ${fileCount} files to references/`);
  } else if (sourceDir) {
    logger.warning(`Source directory ${sourceDir} not found or empty.`);
  }
}

if (import.meta.main) {
  const skillName = Deno.args[0];
  if (!skillName) {
    console.log("Usage: deno run --allow-read --allow-write generate_skill_structure.ts <skill_name> [--source <dir>] [--output <dir>]");
    Deno.exit(1);
  }

  const sourceIdx = Deno.args.indexOf("--source");
  const outputIdx = Deno.args.indexOf("--output");
  const source = sourceIdx !== -1 ? Deno.args[sourceIdx + 1] : undefined;
  const output = outputIdx !== -1 ? Deno.args[outputIdx + 1] : ".claude/skills";

  await generateSkillStructure(skillName, source, output);
}
