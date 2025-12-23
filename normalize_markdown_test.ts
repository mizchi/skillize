import { assertEquals, assertExists } from "jsr:@std/assert";
import { extractFrontmatter, normalizeLinks } from "./normalize_markdown.ts";

Deno.test("extractFrontmatter - parses valid frontmatter", () => {
  const content = `---
title: "Test Title"
source_url: "https://example.com/page"
---

# Content here`;

  const result = extractFrontmatter(content);
  assertExists(result);
  assertEquals(result.title, "Test Title");
  assertEquals(result.source_url, "https://example.com/page");
});

Deno.test("extractFrontmatter - returns null for missing frontmatter", () => {
  const content = "# Just a heading\n\nSome content";
  const result = extractFrontmatter(content);
  assertEquals(result, null);
});

Deno.test("extractFrontmatter - returns null for invalid YAML", () => {
  const content = `---
invalid: yaml: content:
---

# Content`;

  const result = extractFrontmatter(content);
  assertEquals(result, null);
});

Deno.test("normalizeLinks - converts relative links to absolute", () => {
  const content = "Check out [this page](/docs/guide.html) for more info.";
  const sourceUrl = "https://example.com/docs/intro.html";

  const result = normalizeLinks(content, sourceUrl);
  assertEquals(result, "Check out [this page](https://example.com/docs/guide.html) for more info.");
});

Deno.test("normalizeLinks - preserves absolute http links", () => {
  const content = "See [external](https://other.com/page) for details.";
  const sourceUrl = "https://example.com/docs/intro.html";

  const result = normalizeLinks(content, sourceUrl);
  assertEquals(result, "See [external](https://other.com/page) for details.");
});

Deno.test("normalizeLinks - preserves mailto links", () => {
  const content = "Contact [us](mailto:test@example.com) anytime.";
  const sourceUrl = "https://example.com/contact.html";

  const result = normalizeLinks(content, sourceUrl);
  assertEquals(result, "Contact [us](mailto:test@example.com) anytime.");
});

Deno.test("normalizeLinks - preserves anchor links", () => {
  const content = "Jump to [section](#overview) below.";
  const sourceUrl = "https://example.com/page.html";

  const result = normalizeLinks(content, sourceUrl);
  assertEquals(result, "Jump to [section](#overview) below.");
});

Deno.test("normalizeLinks - handles relative paths with ../", () => {
  const content = "Go to [parent](../index.html) page.";
  const sourceUrl = "https://example.com/docs/guide/intro.html";

  const result = normalizeLinks(content, sourceUrl);
  assertEquals(result, "Go to [parent](https://example.com/docs/index.html) page.");
});

Deno.test("normalizeLinks - handles multiple links", () => {
  const content = "See [one](/a.html) and [two](/b.html) and [ext](https://x.com).";
  const sourceUrl = "https://example.com/page.html";

  const result = normalizeLinks(content, sourceUrl);
  assertEquals(
    result,
    "See [one](https://example.com/a.html) and [two](https://example.com/b.html) and [ext](https://x.com)."
  );
});
