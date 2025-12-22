# @mizchi/skillize

**Convert documentation sites into Claude Agent Skills**

A Deno port of [laiso/site2skill](https://github.com/laiso/site2skill).
Original article: [site2skill - ドキュメントサイトを Claude Code Skill に変換するツール](https://blog.lai.so/site2skill/)

Compliant with the [agentskills.io](https://agentskills.io/specification) specification.

## Installation

```bash
deno install -g -A jsr:@mizchi/skillize
```

## Requirements

- Deno 2.0+
- wget (for downloading sites)
- zip (for packaging)

## Usage

```bash
# Basic usage (install to project local)
skillize <URL> <SKILL_NAME>

# Install user-wide (~/.claude/skills/)
skillize <URL> <SKILL_NAME> --user

# Include only specific directories
skillize <URL> <SKILL_NAME> -I /guides/ -I /api/

# Reuse previous download
skillize <URL> <SKILL_NAME> --skip-fetch
```

## Options

```
--local            Install to project's .claude/skills (default)
--user             Install to ~/.claude/skills (user-wide)
--output, -o       Custom output directory (overrides --local/--user)
--include, -I      Include only specified directories (can be repeated)
--exclude, -X      Exclude specified directories (can be repeated)
--skill-output     Output directory for .skill file (default: dist)
--temp-dir         Temporary directory for processing (default: build)
--skip-fetch       Skip download step
--clean            Remove temporary directory after completion
--help, -h         Show help
```

## How It Works

1. **Fetch**: Recursively download documentation site using `wget`
2. **Convert**: Extract content from HTML and convert to Markdown (@mizchi/readability)
3. **Normalize**: Convert links to absolute URLs
4. **Generate**: Create skill structure per agentskills.io specification
5. **Validate**: Check skill structure and naming conventions
6. **Package**: Bundle into .skill file

## Output Structure (agentskills.io spec)

```
<skill-name>/
├── SKILL.md           # Skill definition (name, description required)
├── references/        # Markdown documents
│   └── *.md
└── scripts/
    └── cli.ts         # Search CLI (Deno)
```

## Skill CLI

Generated skills include a search CLI:

```bash
deno run -A scripts/cli.ts search "<query>"
deno run -A scripts/cli.ts search "<query>" --json
deno run -A scripts/cli.ts help
```

## Development

```bash
# Setup after cloning (enable pre-commit hook)
git config core.hooksPath .githooks

# Type check
deno task check

# Secret check (also runs on pre-commit)
deno task lint:secrets
```

## License

MIT
