---
name: command-aliases
description: Manage and configure Pi slash-command aliases, argument forwarding, and autocomplete sources in command-aliases.json. Use when the user wants to create, list, modify, or remove custom shortcut commands without manual TUI interactions.
license: MIT
compatibility: Pi 1.0.2+ with pi-command-aliases installed
metadata:
  version: "0.4.1"
---

# Command Aliases Management Skill

Use this skill when the user asks to add, change, remove, or inspect custom slash-command aliases.

## Configuration File

The single source of truth is located at:
`~/.pi/agent/command-aliases.json`

## Schema Contract

```json
{
  "version": 1,
  "aliases": {
    "<alias-name>": "/<target-command>[ <fixed-args>]"
  },
  "argumentPrefixes": {
    "<alias-name>": "<consumed-first-argument>"
  },
  "completions": {
    "<alias-name>": ["candidate 1", "candidate 2"]
  }
}
```

### Field Rules

1. **`aliases`** (required):
   - Key: Alias command name without leading `/` (alphanumeric, `:`, `_`, `-`, `.`).
   - Value: Target slash command starting with `/`. Can include fixed prefix arguments.
2. **`argumentPrefixes`** (optional):
   - Strips an explicit first argument keyword before forwarding.
   - Example: alias `"gemini": "/antigravity.accounts switch"`, prefix `"gemini": "account"`.
   - Running `/gemini account 2` forwards as `/antigravity.accounts switch 2`.
3. **`completions`** (optional):
   - Static: `["val1", "val2"]`
   - Dynamic top-level JSON keys: `{ "jsonKeys": "filename.json" }` (resolves inside `~/.pi/agent/`).

## Workflow

1. Read `~/.pi/agent/command-aliases.json`. If it does not exist, initialize with `{ "version": 1, "aliases": {} }`.
2. Apply the requested changes (add, edit, or delete keys).
3. Validate that `aliases` is non-empty and all target commands start with `/`.
4. Write back the updated JSON with 2-space indentation.
5. Remind the user to run `/reload` for the changes to take effect immediately in their session.
