import { assertEquals } from "jsr:@std/assert";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exists, walkFiles, isValidHttpUrl } from "./utils.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "skillize_test_" });
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true });
  }
}

// exists tests
Deno.test("exists - returns true for existing file", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "test.txt");
    await fs.writeFile(filePath, "content");
    assertEquals(await exists(filePath), true);
  });
});

Deno.test("exists - returns true for existing directory", async () => {
  await withTempDir(async (dir) => {
    const subDir = path.join(dir, "subdir");
    await fs.mkdir(subDir);
    assertEquals(await exists(subDir), true);
  });
});

Deno.test("exists - returns false for non-existent path", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "nonexistent.txt");
    assertEquals(await exists(filePath), false);
  });
});

// walkFiles tests
Deno.test("walkFiles - yields all files in directory", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "a.txt"), "");
    await fs.writeFile(path.join(dir, "b.txt"), "");

    const files: string[] = [];
    for await (const f of walkFiles(dir)) {
      files.push(path.basename(f));
    }

    files.sort();
    assertEquals(files, ["a.txt", "b.txt"]);
  });
});

Deno.test("walkFiles - recurses into subdirectories", async () => {
  await withTempDir(async (dir) => {
    await fs.mkdir(path.join(dir, "sub"));
    await fs.writeFile(path.join(dir, "root.txt"), "");
    await fs.writeFile(path.join(dir, "sub", "nested.txt"), "");

    const files: string[] = [];
    for await (const f of walkFiles(dir)) {
      files.push(path.basename(f));
    }

    files.sort();
    assertEquals(files, ["nested.txt", "root.txt"]);
  });
});

Deno.test("walkFiles - filters by extension", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "a.html"), "");
    await fs.writeFile(path.join(dir, "b.md"), "");
    await fs.writeFile(path.join(dir, "c.html"), "");

    const files: string[] = [];
    for await (const f of walkFiles(dir, [".html"])) {
      files.push(path.basename(f));
    }

    files.sort();
    assertEquals(files, ["a.html", "c.html"]);
  });
});

Deno.test("walkFiles - accepts extensions without dot prefix", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "a.md"), "");
    await fs.writeFile(path.join(dir, "b.txt"), "");

    const files: string[] = [];
    for await (const f of walkFiles(dir, ["md"])) {
      files.push(path.basename(f));
    }

    assertEquals(files, ["a.md"]);
  });
});

// isValidHttpUrl tests
Deno.test("isValidHttpUrl - accepts valid https URL", () => {
  const result = isValidHttpUrl("https://example.com/docs");
  assertEquals(result.valid, true);
  if (result.valid) {
    assertEquals(result.parsed.hostname, "example.com");
  }
});

Deno.test("isValidHttpUrl - accepts valid http URL", () => {
  const result = isValidHttpUrl("http://example.com/docs");
  assertEquals(result.valid, true);
});

Deno.test("isValidHttpUrl - rejects file:// URL", () => {
  const result = isValidHttpUrl("file:///path/to/file");
  assertEquals(result.valid, false);
  if (!result.valid) {
    assertEquals(result.error.includes("Invalid URL scheme"), true);
  }
});

Deno.test("isValidHttpUrl - rejects ftp:// URL", () => {
  const result = isValidHttpUrl("ftp://example.com/file");
  assertEquals(result.valid, false);
});

Deno.test("isValidHttpUrl - rejects invalid URL string", () => {
  const result = isValidHttpUrl("not a url");
  assertEquals(result.valid, false);
  if (!result.valid) {
    assertEquals(result.error.includes("Invalid URL"), true);
  }
});

Deno.test("isValidHttpUrl - rejects empty string", () => {
  const result = isValidHttpUrl("");
  assertEquals(result.valid, false);
});
