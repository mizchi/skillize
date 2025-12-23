import * as fs from "node:fs/promises";
import YAML from "js-yaml";

interface Frontmatter {
  source_url?: string;
  [key: string]: unknown;
}

export function extractFrontmatter(content: string): Frontmatter | null {
  const match = content.match(/^---\n(.*?)\n---\n/s);
  if (match) {
    try {
      const parsed = YAML.load(match[1]);
      if (parsed && typeof parsed === "object") {
        return parsed as Frontmatter;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeLinks(mdContent: string, sourceUrl: string): string {
  return mdContent.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, url) => {
    if (url.startsWith("http:") || url.startsWith("https:") || url.startsWith("mailto:") || url.startsWith("#")) {
      return match;
    }
    try {
      return `[${text}](${new URL(url, sourceUrl).href})`;
    } catch {
      return match;
    }
  });
}

export async function normalizeMarkdown(inputPath: string, outputPath?: string): Promise<void> {
  try {
    const content = await fs.readFile(inputPath, "utf-8");
    const frontmatter = extractFrontmatter(content);
    const sourceUrl = frontmatter?.source_url;

    const normalized = sourceUrl ? normalizeLinks(content, sourceUrl) : content;
    if (!sourceUrl) {
      console.warn(`Warning: No source_url found in ${inputPath}, skipping link normalization.`);
    }

    if (outputPath) {
      await fs.writeFile(outputPath, normalized);
      console.log(`Normalized: ${inputPath}`);
    } else {
      console.log(normalized);
    }
  } catch (e) {
    console.error(`Error normalizing ${inputPath}: ${e}`);
  }
}

if (import.meta.main) {
  const args = Deno.args;
  if (args.length < 1) {
    console.log("Usage: deno run --allow-read --allow-write normalize_markdown.ts <input_file> [--output <file>]");
    Deno.exit(1);
  }

  const inputFile = args[0];
  const outputIdx = args.indexOf("--output");
  const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  await normalizeMarkdown(inputFile, output);
}
