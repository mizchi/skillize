import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readable } from "@mizchi/readability";

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warning: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

export async function convertHtmlToMd(
  htmlPath: string,
  outputPath?: string,
  sourceUrl?: string,
  fetchedAt?: string
): Promise<void> {
  try {
    const htmlContent = await fs.readFile(htmlPath, "utf-8");

    const doc = readable(htmlContent, { url: sourceUrl });
    const metadata = doc.snapshot.metadata;
    const title = metadata.title || "Untitled";
    const mdBody = doc.toMarkdown();

    if (!mdBody.trim()) {
      logger.warning(`No content extracted from ${htmlPath}`);
      return;
    }

    const escapedTitle = title.replace(/"/g, '\\"');
    let frontmatter = "---\n";
    frontmatter += `title: "${escapedTitle}"\n`;
    if (sourceUrl) frontmatter += `source_url: "${sourceUrl}"\n`;
    if (fetchedAt) frontmatter += `fetched_at: "${fetchedAt}"\n`;
    frontmatter += "---\n\n";

    const finalMd = frontmatter + mdBody;

    if (outputPath) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, finalMd);
      logger.info(`Converted: ${htmlPath} -> ${outputPath}`);
    } else {
      console.log(finalMd);
    }
  } catch (e) {
    logger.error(`Error converting ${htmlPath}: ${e}`);
  }
}

if (import.meta.main) {
  const args = Deno.args;
  if (args.length < 1) {
    console.log("Usage: deno run --allow-read --allow-write convert_to_markdown.ts <input_file> [--output <file>] [--url <url>] [--fetched-at <timestamp>]");
    Deno.exit(1);
  }

  const inputFile = args[0];
  const outputIdx = args.indexOf("--output");
  const urlIdx = args.indexOf("--url");
  const fetchedAtIdx = args.indexOf("--fetched-at");

  const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;
  const url = urlIdx !== -1 ? args[urlIdx + 1] : undefined;
  const fetchedAt = fetchedAtIdx !== -1 ? args[fetchedAtIdx + 1] : undefined;

  await convertHtmlToMd(inputFile, output, url, fetchedAt);
}
