#!/usr/bin/env -S deno run --allow-read --allow-sys --allow-net --allow-run --allow-write
/**
 * CLI for Claude Code Skill (agentskills.io specification)
 *
 * This skill provides access to documentation converted from a website.
 * All documentation files are in the `references/` directory as Markdown files.
 * Each file has YAML frontmatter with `source_url` and `fetched_at` metadata.
 *
 * Usage:
 *   deno run -A scripts/cli.ts search <query>     Search documentation
 *   deno run -A scripts/cli.ts update             Re-fetch and update documentation
 *   deno run -A scripts/cli.ts help               Show this help
 *
 * Search Options:
 *   --max-results, -n  Maximum number of results (default: 10)
 *   --json             Output as JSON
 *
 * When using this skill, always cite the source URL in responses.
 */

import * as path from "node:path";
import * as fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
// deno-lint-ignore no-external-import
import YAML from "npm:js-yaml";

// ============================================================================
// Configuration
// ============================================================================

// scripts/cli.ts -> skill root -> references/
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.dirname(SCRIPTS_DIR);
const REFERENCES_DIR = path.join(SKILL_DIR, "references");

// ============================================================================
// Utilities
// ============================================================================

const Colors = {
  HEADER: "\x1b[95m",
  CYAN: "\x1b[96m",
  ENDC: "\x1b[0m",
  BOLD: "\x1b[1m",
};

interface Frontmatter {
  title?: string;
  source_url?: string;
  fetched_at?: string;
  [key: string]: unknown;
}

interface SearchResult {
  file: string;
  matches: number;
  contexts: string[];
  source_url: string;
  fetched_at: string;
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

function extractFrontmatter(content: string): [Frontmatter, string] {
  const frontmatter: Frontmatter = {};
  let body = content;

  const match = content.match(/^---\s*\n(.*?)\n---\s*\n(.*)/s);
  if (match) {
    try {
      const parsed = YAML.load(match[1]) as Frontmatter;
      if (parsed && typeof parsed === "object") {
        Object.assign(frontmatter, parsed);
      }
    } catch {
      // Ignore parse errors
    }
    body = match[2];
  }

  return [frontmatter, body];
}

// ============================================================================
// Search Command
// ============================================================================

function getContext(text: string, query: string, contextLines = 2): string[] {
  const lines = text.split("\n");
  const keywords = query.toLowerCase().split(/\s+/);
  const contexts: string[] = [];

  const matchIndices = lines
    .map((line, i) => (keywords.some((kw) => line.toLowerCase().includes(kw)) ? i : -1))
    .filter((i) => i !== -1);

  if (matchIndices.length === 0) return [];

  const groups: number[][] = [];
  let currentGroup = [matchIndices[0]];
  for (let i = 1; i < matchIndices.length; i++) {
    if (matchIndices[i] - matchIndices[i - 1] <= contextLines * 2 + 1) {
      currentGroup.push(matchIndices[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [matchIndices[i]];
    }
  }
  groups.push(currentGroup);

  for (const group of groups) {
    const startIdx = Math.max(0, group[0] - contextLines);
    const endIdx = Math.min(lines.length, group[group.length - 1] + contextLines + 1);
    const snippetLines = lines.slice(startIdx, endIdx);

    const formatted: string[] = [];
    for (let i = 0; i < snippetLines.length; i++) {
      const originalIdx = startIdx + i;
      const prefix = group.includes(originalIdx) ? "> " : "  ";
      formatted.push(`${prefix}${snippetLines[i]}`);
    }
    contexts.push(formatted.join("\n"));
  }

  return contexts;
}

async function searchDocs(query: string, maxResults = 10): Promise<SearchResult[]> {
  try {
    await fs.access(REFERENCES_DIR);
  } catch {
    console.error(`Error: ${REFERENCES_DIR} not found.`);
    return [];
  }

  const keywords = query.toLowerCase().split(/\s+/);
  const results: SearchResult[] = [];

  for await (const filePath of walkFiles(REFERENCES_DIR, [".md"])) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const [frontmatter, body] = extractFrontmatter(content);
      const bodyLower = body.toLowerCase();

      let matchesCount = 0;
      for (const kw of keywords) {
        let idx = 0;
        while ((idx = bodyLower.indexOf(kw, idx)) !== -1) {
          matchesCount++;
          idx += kw.length;
        }
      }

      if (matchesCount > 0) {
        results.push({
          file: path.relative(SKILL_DIR, filePath),
          matches: matchesCount,
          contexts: getContext(body, query),
          source_url: (frontmatter.source_url as string) || "Unknown",
          fetched_at: (frontmatter.fetched_at as string) || "Unknown",
        });
      }
    } catch (e) {
      console.error(`Error reading ${filePath}: ${e}`);
    }
  }

  results.sort((a, b) => b.matches - a.matches);
  return results.slice(0, maxResults);
}

function formatResults(results: SearchResult[], query: string): void {
  if (results.length === 0) {
    console.log(`No matches found for '${query}'.`);
    return;
  }

  console.log(`\n${Colors.HEADER}Search Results for '${query}'${Colors.ENDC}`);
  console.log(`Found matches in ${results.length} files.\n`);

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    console.log(`${Colors.BOLD}${i + 1}. ${res.file}${Colors.ENDC}`);
    console.log(`   Matches: ${res.matches} | Source: ${res.source_url}`);
    console.log(`   Fetched: ${res.fetched_at}`);
    console.log(`${Colors.CYAN}${"-".repeat(40)}${Colors.ENDC}`);

    for (const ctx of res.contexts.slice(0, 3)) {
      console.log(ctx);
      console.log("   ...");
    }
    console.log("");
  }
}

async function cmdSearch(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      "max-results": { type: "string", short: "n" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
  });

  if (positionals.length === 0) {
    console.error("Usage: cli.ts search <query> [-n <max>] [--json]");
    Deno.exit(1);
  }

  const query = positionals.join(" ");
  const maxResults = parseInt(values["max-results"] || "10", 10);
  const results = await searchDocs(query, maxResults);

  if (values.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    formatResults(results, query);
  }
}

// ============================================================================
// Update Command
// ============================================================================

async function cmdUpdate(): Promise<void> {
  // Read source URL from any existing doc to determine the base URL
  let sourceUrl: string | null = null;

  try {
    for await (const filePath of walkFiles(REFERENCES_DIR, [".md"])) {
      const content = await fs.readFile(filePath, "utf-8");
      const [frontmatter] = extractFrontmatter(content);
      if (frontmatter.source_url) {
        const url = new URL(frontmatter.source_url);
        sourceUrl = `${url.protocol}//${url.host}${url.pathname.split("/").slice(0, -1).join("/")}`;
        break;
      }
    }
  } catch {
    // Ignore
  }

  if (!sourceUrl) {
    console.error("Error: Could not determine source URL from existing docs.");
    console.error("Please run site2skill manually to update this skill.");
    Deno.exit(1);
  }

  console.log(`Source URL: ${sourceUrl}`);
  console.log("To update this skill, run site2skill with the source URL.");
  console.log(`\n  deno run -A <site2skill>/main.ts "${sourceUrl}" <skill-name>\n`);
}

// ============================================================================
// Main
// ============================================================================

function showHelp(): void {
  console.log(`CLI for Claude Code Skill

Usage:
  deno run -A cli.ts <command> [options]

Commands:
  search <query>  Search documentation
  update          Show update instructions
  help            Show this help

Search Options:
  --max-results, -n  Maximum number of results (default: 10)
  --json             Output as JSON

Examples:
  deno run -A cli.ts search "validation"
  deno run -A cli.ts search schema -n 5 --json
`);
}

async function main(): Promise<void> {
  const command = Deno.args[0];
  const args = Deno.args.slice(1);

  switch (command) {
    case "search":
      await cmdSearch(args);
      break;
    case "update":
      await cmdUpdate();
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      showHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
