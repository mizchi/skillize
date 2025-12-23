import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function* walkFiles(dir: string, exts?: string[]): AsyncGenerator<string> {
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

export function isValidHttpUrl(url: string): { valid: true; parsed: URL } | { valid: false; error: string } {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: `Invalid URL: ${url}` };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { valid: false, error: `Invalid URL scheme: ${parsedUrl.protocol}. Only 'http' and 'https' are supported.` };
  }

  if (!parsedUrl.hostname) {
    return { valid: false, error: `Invalid URL: ${url}. Domain is missing.` };
  }

  return { valid: true, parsed: parsedUrl };
}
