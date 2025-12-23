import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";

import { fetchSite } from "./fetch_site.ts";
import { convertHtmlToMd } from "./convert_to_markdown.ts";
import { normalizeMarkdown } from "./normalize_markdown.ts";
import { generateSkillStructure, type GenerationInfo } from "./generate_skill_structure.ts";
import { validateSkill } from "./validate_skill.ts";
import { packageSkill } from "./package_skill.ts";
import { exists, walkFiles } from "./utils.ts";

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warning: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

function showHelp(): void {
  console.log(`site2skill - Turn any documentation website into a Claude Agent Skill

Usage:
  deno run -A main.ts <URL> <SKILL_NAME> [options]

Options:
  --local            Install to project's .claude/skills (default)
  --user             Install to ~/.claude/skills (user-wide)
  --output, -o       Custom output directory (overrides --local/--user)
  --include, -I      Include only these directories (can be repeated)
  --exclude, -X      Exclude these directories (can be repeated)
  --skill-output     Output directory for .skill file (default: dist)
  --temp-dir         Temporary directory (default: build)
  --skip-fetch       Skip download step
  --clean            Clean up temp directory after completion
  --help, -h         Show this help

Examples:
  deno run -A main.ts https://docs.example.com my-skill
  deno run -A main.ts https://docs.example.com my-skill --user
  deno run -A main.ts https://docs.example.com my-skill -I /guides/ -I /api/
  deno run -A main.ts https://docs.example.com my-skill -X /blog/ -X /changelog/
`);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Deno.args,
    options: {
      local: { type: "boolean", default: false },
      user: { type: "boolean", default: false },
      output: { type: "string", short: "o" },
      include: { type: "string", short: "I", multiple: true },
      exclude: { type: "string", short: "X", multiple: true },
      "skill-output": { type: "string", default: "dist" },
      "temp-dir": { type: "string", default: "build" },
      "skip-fetch": { type: "boolean", default: false },
      clean: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length < 2) {
    showHelp();
    Deno.exit(values.help ? 0 : 1);
  }

  // Determine output directory
  let outputBase: string;
  if (values.output) {
    outputBase = values.output;
  } else if (values.user) {
    outputBase = path.join(homedir(), ".claude", "skills");
  } else {
    // --local is default
    outputBase = ".claude/skills";
  }

  const url = String(positionals[0]);
  const skillName = String(positionals[1]);
  const skillOutput = values["skill-output"] as string;
  const tempDir = values["temp-dir"] as string;
  const skipFetch = values["skip-fetch"] as boolean;
  const clean = values.clean as boolean;
  const includeDirs = values.include as string[] | undefined;
  const excludeDirs = values.exclude as string[] | undefined;

  try {
    const tempDownloadDir = path.join(tempDir, "download");
    const tempMdDir = path.join(tempDir, "markdown");

    if (!skipFetch) {
      if (await exists(tempDir)) await fs.rm(tempDir, { recursive: true });
      await fs.mkdir(tempDownloadDir, { recursive: true });
    }
    await fs.mkdir(tempMdDir, { recursive: true });

    const fetchedAt = new Date().toISOString();

    if (!skipFetch) {
      logger.info(`=== Step 1: Fetching ${url} ===`);
      await fetchSite(url, tempDownloadDir, { includeDirs, excludeDirs });
    } else {
      logger.info(`=== Step 1: Skipped Fetching ===`);
    }

    const crawlDir = path.join(tempDownloadDir, "crawl");

    logger.info(`=== Step 2: Converting HTML to Markdown ===`);
    const htmlFiles: string[] = [];
    for await (const f of walkFiles(crawlDir, [".html"])) {
      htmlFiles.push(f);
    }
    logger.info(`Found ${htmlFiles.length} HTML files.`);

    const parsedInputUrl = new URL(url);
    const scheme = parsedInputUrl.protocol.replace(":", "");

    let convertedCount = 0;
    let skippedCount = 0;

    for (const htmlFile of htmlFiles) {
      const absHtmlFile = path.resolve(htmlFile);
      const absCrawlDir = path.resolve(crawlDir);
      if (!absHtmlFile.startsWith(absCrawlDir)) {
        logger.warning(`Skipping path traversal: ${htmlFile}`);
        continue;
      }

      const relPath = path.relative(crawlDir, htmlFile);
      const relPathForUrl = relPath.endsWith(".html") ? relPath.slice(0, -5) : relPath;
      const sourceUrl = `${scheme}://${relPathForUrl}`;

      const filename = path.basename(htmlFile);
      let nameWithoutExt: string;
      if (filename === "index.html") {
        const parentDir = path.basename(path.dirname(htmlFile));
        nameWithoutExt = parentDir === "crawl" ? "index" : parentDir;
      } else {
        nameWithoutExt = filename.replace(/\.html$/, "");
      }
      nameWithoutExt = nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, "_");

      const mdPath = path.join(tempMdDir, nameWithoutExt + ".md");
      if (await exists(mdPath)) {
        skippedCount++;
        continue; // Skip already converted files
      }

      await convertHtmlToMd(htmlFile, mdPath, sourceUrl, fetchedAt);
      convertedCount++;
    }

    logger.info(`Converted ${convertedCount} files, skipped ${skippedCount} cached files.`);

    logger.info(`=== Step 3: Normalizing Markdown ===`);
    for await (const mdFile of walkFiles(tempMdDir, [".md"])) {
      await normalizeMarkdown(mdFile, mdFile);
    }

    logger.info(`=== Step 4: Generating Skill Structure ===`);
    const scriptDir = import.meta.dirname!;
    const templateDir = path.join(scriptDir, "templates");

    // Build command string for documentation
    const cmdParts = ["skillize", url, skillName];
    if (values.user) cmdParts.push("--user");
    if (values.output) cmdParts.push("-o", values.output as string);
    if (includeDirs) includeDirs.forEach((d) => cmdParts.push("-I", d));
    if (excludeDirs) excludeDirs.forEach((d) => cmdParts.push("-X", d));

    const generationInfo: GenerationInfo = {
      sourceUrl: url,
      command: cmdParts.join(" "),
      generatedAt: fetchedAt,
    };

    await generateSkillStructure(skillName, tempMdDir, outputBase, templateDir, generationInfo);

    const skillDir = path.join(outputBase, skillName);

    logger.info(`=== Step 5: Validating Skill ===`);
    if (!(await validateSkill(skillDir))) {
      logger.error("Validation failed.");
    }

    logger.info(`=== Step 6: Packaging Skill ===`);
    const skillFile = await packageSkill(skillDir, skillOutput);

    logger.info(`=== Done! ===`);
    logger.info(`Skill directory: ${skillDir}`);
    if (skillFile) logger.info(`Skill package: ${skillFile}`);

    if (clean) {
      await fs.rm(tempDir, { recursive: true });
      logger.info(`Temporary files removed.`);
    }
  } catch (e) {
    logger.error(`An unexpected error occurred: ${e}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
