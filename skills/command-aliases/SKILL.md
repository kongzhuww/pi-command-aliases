---
name: command-aliases
description: Manage and configure Pi slash-command aliases, argument forwarding, and autocomplete sources in command-aliases.json. 管理与配置 Pi 的斜杠命令快捷别名、参数转发与自动补全源。Use when the user wants to create, list, modify, or remove custom shortcut commands without manual TUI interactions.
license: MIT
compatibility: Pi 1.0.2+ with pi-command-aliases installed
metadata:
  version: "0.4.3"
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

---

## 中文工作流指南

当用户用中文要求管理、添加、修改或查看命令别名时使用本技能：
1. 读取 `~/.pi/agent/command-aliases.json`，若文件不存在则初始化为 `{ "version": 1, "aliases": {} }`。
2. 根据用户指令增删改对应的别名映射（`aliases`）、参数前缀（`argumentPrefixes`）或自动补全（`completions`）。
3. 校验 `aliases` 非空且所有目标命令均以 `/` 开头。
4. 使用 2 格缩进原子写入更新后的 JSON 文件。
5. 提示用户输入 `/reload` 立即重新加载生效。
