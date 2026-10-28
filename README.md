# pi-command-aliases

> Visual command alias manager and slash-command forwarding suite for [Pi](https://github.com/earendil-works/pi).

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Pi Extension](https://img.shields.io/badge/Pi-Extension-emerald)](https://pi.dev/packages)

Turn long, complex slash commands into short, intuitive shortcuts with full argument forwarding, autocomplete hints, and a built-in split-pane interactive TUI manager.

---

## ✨ Features

- ⚡ **Short & Sweet**: Shorten multi-word commands like `/extension-toggle use platform` down to `/switch platform`.
- 🖥️ **Interactive Visual TUI (`/aliases`)**:
  - Two-column split layout: **What you type** (left) vs. **What gets executed** (right).
  - Search filter (`/`), new (`n`), edit (`Enter`/`e`), and delete (`d`/`Delete`).
  - Viewport-constrained target picker that follows cursor movement and supports keyboard navigation.
- 🎯 **Seamless Argument Forwarding**: Appends custom arguments verbatim to the target command without re-parsing quotes.
- 🔍 **Dynamic Autocomplete Integration**:
  - Type `/swit` and get immediate completion for `/switch daily`, `/switch platform`, etc.
  - Supports static candidate lists or dynamic JSON-backed key sources.
- 🔒 **Zero Token Overhead & Zero-Execution Preview**:
  - Pure local extension dispatch — does **not** register unnecessary AI tools or consume model context.
  - Previews only render mappings and never trigger remote execution or account changes.
- 🛡️ **Atomic Storage & Concurrency Safety**: File-locking, pre-save backup generation, and collision detection to prevent overwriting parallel session edits.

---

## 📦 Installation

Requires Pi 1.0.2 or newer.

```bash
pi install github:kongzhuww/pi-command-aliases
```

Or clone locally and link into your `~/.pi/agent/extensions/` directory.

Run `/reload` inside Pi after installation.

---

## 🚀 Quick Start

### 1. Visual Manager (Recommended)

Type `/aliases` in interactive mode to open the management panel:

```text
命令别名管理
筛选: 全部 | 2 条规则

你输入的命令                  | 实际执行的命令
------------------------------------------------------------------------
> /switch <参数>              | /extension-toggle use <参数>
  /gemini account <参数>      | /antigravity.accounts switch <参数>

预览（只显示，不执行）
  /switch daily              | /extension-toggle use daily
  /switch platform           | /extension-toggle use platform

↑↓ 选择 | n 新建 | Enter 编辑 | d 删除 | / 搜索
Ctrl+S 保存 | Esc 关闭 | 保存后 /reload 生效
```

### 2. Manual Configuration

You can also directly edit `~/.pi/agent/command-aliases.json`:

```json
{
  "version": 1,
  "aliases": {
    "switch": "/extension-toggle use",
    "gemini": "/antigravity.accounts switch"
  },
  "argumentPrefixes": {
    "gemini": "account"
  },
  "completions": {
    "switch": { "jsonKeys": "extension-toggle-collections.json" },
    "gemini": ["account 1", "account 2", "account 3", "account 4"]
  }
}
```

Run `/reload` inside Pi to apply changes.

---

## 🛠️ Configuration Spec

| Field | Type | Description |
|---|---|---|
| `version` | `number` | Schema version (must be `1`). |
| `aliases` | `Record<string, string>` | Map of alias names to target slash commands. Target must start with `/`. |
| `argumentPrefixes` | `Record<string, string>` | (Optional) Consumes a mandatory sub-command keyword before forwarding (e.g. `account` in `/gemini account 1`). |
| `completions` | `Record<string, string[] \| { jsonKeys: string }>` | (Optional) Autocomplete sources for each alias. Can be an array of strings or a pointer to top-level keys in an agent JSON file. |

---

## 🧪 Testing

The repository comes with a comprehensive offline test suite covering:
- Unit resolution, cycle detection, quote handling, and argument consumption (`test.cjs`).
- Real Pi Autocomplete provider integration and prefix matching (`completion-test.mjs`).
- Split-pane TUI rendering, viewport bounds, and atomic storage lock tests (`manager-test.mjs`).
- Real Pi extension runner command context dispatch (`integration-test.mjs`).

To run tests locally:

```bash
node test.cjs
node completion-test.mjs <path-to-pi-package-root>
node manager-test.mjs <path-to-pi-package-root>
node integration-test.mjs <path-to-pi-package-root> <path-to-agent-dir>
```

---

## 📄 License

[MIT](LICENSE) © 2026 [kongzhuww](https://github.com/kongzhuww)
