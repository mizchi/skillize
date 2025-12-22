import * as fs from "node:fs/promises";
import * as path from "node:path";

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warning: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
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
 * Validate skill name according to agentskills.io specification:
 * - 1-64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with a hyphen
 * - No consecutive hyphens
 */
function validateSkillName(name: string): string[] {
  const errors: string[] = [];

  if (name.length < 1 || name.length > 64) {
    errors.push(`name must be 1-64 characters (got ${name.length})`);
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    errors.push("name must contain only lowercase letters, numbers, and hyphens");
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push("name must not start or end with a hyphen");
  }
  if (name.includes("--")) {
    errors.push("name must not contain consecutive hyphens");
  }

  return errors;
}

async function checkSkillSize(skillDir: string): Promise<void> {
  const referencesDir = path.join(skillDir, "references");
  if (!(await exists(referencesDir))) return;

  let totalSize = 0;
  const fileSizes: { size: number; path: string }[] = [];

  for await (const filePath of walkFiles(referencesDir)) {
    try {
      const stat = await fs.stat(filePath);
      totalSize += stat.size;
      fileSizes.push({ size: stat.size, path: filePath });
    } catch {
      // Ignore
    }
  }

  fileSizes.sort((a, b) => b.size - a.size);

  const totalSizeMb = totalSize / (1024 * 1024);
  logger.info("\n--- Skill Size Analysis ---");
  logger.info(`Total Uncompressed Size: ${totalSizeMb.toFixed(2)} MB`);

  if (totalSize > 8 * 1024 * 1024) {
    logger.warning("Skill uncompressed size exceeds Claude's 8MB limit.");
  } else {
    logger.info("Size is within limits (< 8MB).");
  }

  logger.info("\nTop 10 Largest Files:");
  for (const { size, path: filePath } of fileSizes.slice(0, 10)) {
    logger.info(`  ${(size / 1024).toFixed(1)} KB - ${path.relative(skillDir, filePath)}`);
  }
  logger.info("---------------------------\n");
}

export async function validateSkill(skillDir: string): Promise<boolean> {
  logger.info(`Validating skill in: ${skillDir}`);

  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const stat = await fs.stat(skillDir);
    if (!stat.isDirectory()) {
      logger.error(`Not a directory: ${skillDir}`);
      return false;
    }
  } catch {
    logger.error(`Directory not found: ${skillDir}`);
    return false;
  }

  // Validate directory name matches skill name requirements
  const dirName = path.basename(skillDir);
  const nameErrors = validateSkillName(dirName);
  if (nameErrors.length > 0) {
    nameErrors.forEach(e => warnings.push(`Directory name: ${e}`));
  }

  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!(await exists(skillMdPath))) {
    errors.push("SKILL.md not found.");
  } else {
    logger.info("Found SKILL.md");
    try {
      const content = await fs.readFile(skillMdPath, "utf-8");
      if (content.startsWith("---\n")) {
        const match = content.match(/^---\n(.*?)\n---/s);
        if (match) {
          const fm = match[1];

          // Check required fields
          for (const field of ["name", "description"]) {
            if (!fm.includes(`${field}:`)) {
              errors.push(`SKILL.md frontmatter missing required '${field}' field`);
            }
          }

          // Validate name matches directory name
          const nameMatch = fm.match(/^name:\s*(.+)$/m);
          if (nameMatch) {
            const skillName = nameMatch[1].trim();
            if (skillName !== dirName) {
              warnings.push(`SKILL.md name '${skillName}' does not match directory name '${dirName}'`);
            }
            const skillNameErrors = validateSkillName(skillName);
            skillNameErrors.forEach(e => errors.push(`SKILL.md name: ${e}`));
          }

          logger.info("  YAML frontmatter present");
        } else {
          warnings.push("SKILL.md has incomplete frontmatter");
        }
      } else {
        errors.push("SKILL.md missing YAML frontmatter");
      }
    } catch (e) {
      warnings.push(`Could not validate SKILL.md: ${e}`);
    }
  }

  // Check references/ directory (required for documentation skills)
  const referencesDir = path.join(skillDir, "references");
  try {
    const stat = await fs.stat(referencesDir);
    if (!stat.isDirectory()) {
      errors.push("references/ is not a directory.");
    } else {
      logger.info("Found references/");
      const mdFiles: string[] = [];
      for await (const f of walkFiles(referencesDir, [".md"])) {
        mdFiles.push(f);
      }
      if (mdFiles.length === 0) {
        warnings.push("references/ directory is empty (no .md files)");
      } else {
        logger.info(`  ${mdFiles.length} markdown files`);
      }
    }
  } catch {
    warnings.push("references/ directory not found (optional but recommended).");
  }

  // Check scripts/ directory (optional)
  if (await exists(path.join(skillDir, "scripts"))) {
    logger.info("Found scripts/");
  }

  // Check assets/ directory (optional)
  if (await exists(path.join(skillDir, "assets"))) {
    logger.info("Found assets/");
  }

  await checkSkillSize(skillDir);

  if (errors.length > 0) {
    logger.error("VALIDATION FAILED:");
    errors.forEach((e) => logger.error(`  - ${e}`));
    return false;
  }

  if (warnings.length > 0) {
    logger.warning("Warnings:");
    warnings.forEach((w) => logger.warning(`  - ${w}`));
  }

  logger.info("Validation passed!");
  return true;
}

if (import.meta.main) {
  const skillDir = Deno.args[0];
  if (!skillDir) {
    console.log("Usage: deno run --allow-read validate_skill.ts <skill_dir>");
    Deno.exit(1);
  }
  if (!(await validateSkill(skillDir))) Deno.exit(1);
}
