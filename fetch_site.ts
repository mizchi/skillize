import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exists, isValidHttpUrl } from "./utils.ts";

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warning: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

async function checkWgetInstalled(): Promise<boolean> {
  try {
    const command = new Deno.Command("which", { args: ["wget"] });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}

export interface FetchOptions {
  includeDirs?: string[];
  excludeDirs?: string[];
}

export async function fetchSite(url: string, outputDir: string, options: FetchOptions = {}): Promise<void> {
  const urlResult = isValidHttpUrl(url);
  if (!urlResult.valid) {
    logger.error(urlResult.error);
    Deno.exit(1);
  }
  const parsedUrl = urlResult.parsed;

  if (!(await checkWgetInstalled())) {
    logger.error("wget is not installed. Please install wget to use this tool.");
    Deno.exit(1);
  }

  const domain = parsedUrl.hostname;
  const crawlDir = path.join(outputDir, "crawl");

  await fs.mkdir(outputDir, { recursive: true });

  if (await exists(crawlDir)) {
    await fs.rm(crawlDir, { recursive: true });
  }
  await fs.mkdir(crawlDir, { recursive: true });

  logger.info(`Fetching ${url} to ${crawlDir}...`);
  logger.info(`Domain restricted to: ${domain}`);

  const cmd = [
    "wget",
    "--recursive",
    "--level=5",
    "--no-parent",
    `--domains=${domain}`,
    "--adjust-extension",
    "--convert-links",
    "--reject=css,js,png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,eot,zip,tar,gz,pdf,xml,json,txt",
    "--user-agent=site2skill/0.1 (+https://github.com/laiso/site2skill)",
    "--execute",
    "robots=on",
    "--wait=1",
    "--random-wait",
    "-P",
    crawlDir,
  ];

  // Add include directories
  if (options.includeDirs && options.includeDirs.length > 0) {
    cmd.push(`--include-directories=${options.includeDirs.join(",")}`);
    logger.info(`Including directories: ${options.includeDirs.join(", ")}`);
  }

  // Add exclude directories
  if (options.excludeDirs && options.excludeDirs.length > 0) {
    cmd.push(`--exclude-directories=${options.excludeDirs.join(",")}`);
    logger.info(`Excluding directories: ${options.excludeDirs.join(", ")}`);
  }

  cmd.push("--", url);

  try {
    const startTime = Date.now();
    const downloadedUrls = new Set<string>();
    let currentUrl = "";

    const command = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdout: "piped",
      stderr: "piped",
    });

    const process = command.spawn();
    const decoder = new TextDecoder();

    const readStream = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const urlMatch = line.match(
            /--\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}--\s+(\S+)/
          );
          if (urlMatch) {
            currentUrl = urlMatch[1];
          }

          if (line.toLowerCase().includes("saved") || line.includes("Saving to:")) {
            downloadedUrls.add(currentUrl);
            const count = downloadedUrls.size;
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = count / elapsed;
            const mins = Math.floor(elapsed / 60);
            const secs = Math.floor(elapsed % 60);
            const shortUrl = currentUrl.length > 40 ? currentUrl.slice(-40) : currentUrl.padEnd(40);

            const progressMsg = `\r[${count} pages | ${mins}m${secs.toString().padStart(2, "0")}s | ${rate.toFixed(1)}/s] ${shortUrl}`;
            await Deno.stdout.write(new TextEncoder().encode(progressMsg));
          }
        }
      }
    };

    await Promise.all([readStream(process.stdout), readStream(process.stderr)]);

    const { code } = await process.status;
    console.log();

    const elapsed = (Date.now() - startTime) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    logger.info(`Download complete. ${downloadedUrls.size} pages in ${mins}m${secs.toString().padStart(2, "0")}s.`);

    if (code === 4) {
      logger.warning("Wget returned exit code 4 (Network Failure). Some files may not have been downloaded.");
    } else if (code === 6) {
      logger.warning("Wget returned exit code 6 (Username/Password Authentication Failure).");
    } else if (code === 8) {
      logger.warning("Wget returned exit code 8 (Server Error). Some links returned 404/403.");
    } else if (code !== 0) {
      logger.warning(`Wget returned exit code ${code}. Download may be incomplete.`);
    }
  } catch (e) {
    logger.error(`An error occurred while running wget: ${e}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  const args = Deno.args;
  if (args.length < 1) {
    console.log("Usage: deno run --allow-run --allow-read --allow-write fetch_site.ts <url> [--output <dir>]");
    Deno.exit(1);
  }

  const url = args[0];
  const outputIdx = args.indexOf("--output");
  const output = outputIdx !== -1 ? args[outputIdx + 1] : "temp_docs";

  await fetchSite(url, output);
}
