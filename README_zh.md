# pi-command-aliases

> 专为 [Pi](https://github.com/earendil-works/pi) 打造的可视化命令别名管理器与斜杠命令转发扩展套件。

[English](README.md) | **简体中文**

<p align="left">
  <a href="https://www.npmjs.com/package/pi-command-aliases"><img src="https://img.shields.io/npm/v/pi-command-aliases.svg?color=cb3837&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/pi-command-aliases"><img src="https://img.shields.io/npm/dm/pi-command-aliases.svg?color=blue&logo=npm" alt="npm downloads"></a>
  <a href="https://github.com/kongzhuww/pi-command-aliases/stargazers"><img src="https://img.shields.io/github/stars/kongzhuww/pi-command-aliases?color=yellow&logo=github" alt="GitHub stars"></a>
  <a href="https://pi.dev/packages"><img src="https://img.shields.io/badge/Pi-官方目录-emerald?logo=target" alt="Pi 官方扩展目录"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="License: MIT"></a>
</p>

将冗长、繁琐的斜杠命令缩短为简明直观的快捷方式。支持完整的参数无缝转发、动态自动补全建议，并内置交互式双栏 TUI 别名管理器。

---

## 🚀 官方分发与安装

`pi-command-aliases` 已正式发布至 **npm**，并已被官方 **[Pi 扩展目录 (pi.dev/packages)](https://pi.dev/packages)** 收录。

### 一键安装：

```bash
pi install npm:pi-command-aliases
```

*(也可以通过 GitHub 直接安装：`pi install github:kongzhuww/pi-command-aliases`)*

安装完成后，在 Pi 中输入 `/reload` 即可加载生效。

---

## ✨ 核心特性

- ⚡ **简捷高效**：将像 `/extension-toggle use platform` 这样繁冗的多词命令直接精简为 `/switch platform`。
- 🖥️ **交互式可视化 TUI 面板 (`/aliases`)**：
  - 双栏左右对照布局：左侧显示**你输入的命令**，右侧显示**实际执行的命令**。
  - 便捷操作：实时筛选 (`/`)、新建 (`n`)、编辑 (`Enter`/`e`) 与删除 (`d`/`Delete`)。
  - 视口自适应目标选择器：跟随光标移动，支持上下移动、翻页与快速过滤，终端缩放自适应。
- 🎯 **参数无损透明转发**：将附带参数原样追加至目标命令后，不重新解析或破坏引号结构。
- 🔍 **动态自动补全深度集成**：
  - 输入 `/swit` 即可提示 `/switch daily`、`/switch platform` 等补全项。
  - 支持配置静态候选词列表，或动态读取 agent 目录下指定 JSON 文件的顶级键名。
- 🤖 **内置 Agent 技能（无需手动编辑配置）**：
  - 内置 `command-aliases` 技能。你甚至无需打开 TUI 面板，直接对 AI 说：*“帮我把 `/ext` 映射到 `/extension-toggle`”*，AI 就会自动验证规则并保存！
- 🔒 **零 Token 开销与无副作用预览**：
  - 纯本地命令转发，**不**向模型注册无用的额外工具，不浪费上下文上下文窗口 Token。
  - 预览区仅计算展示映射文本，绝不实际调用命令或切换账号。
- 🛡️ **原子化持久存储与并发安全**：支持独占文件锁、保存前自动生成带时间戳的备份文件，以及并发写入冲突检测，防止多窗口会话覆盖彼此的改动。

---

## 🎮 使用说明

### 1. 交互式可视化管理器 (`/aliases`)

在 Pi 的交互模式下输入 `/aliases`：

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

### 2. 补全提示体验

在命令输入框中输入命令时：
- 输入 `/swit` ➡️ 自动补全提示 `/switch daily`、`/switch platform` 等。
- 输入 `/gem` ➡️ 自动补全提示 `/gemini account 1`、`/gemini account 2` 等。

### 3. 让 AI 帮你配置别名

直接与 Pi 对话即可：
> *“把 `/switch <组名>` 映射到 `/extension-toggle use <组名>`，候选参数从 `extension-toggle-collections.json` 读取”*

扩展内嵌的 Skill 会自动读取配置、校验 schema 规范、原子写入并提示重载。

---

## 🛠️ 配置文件规范 (`~/.pi/agent/command-aliases.json`)

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

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | `number` | 配置版本号（必须为 `1`）。 |
| `aliases` | `Record<string, string>` | 别名与目标斜杠命令的键值映射。目标命令必须以 `/` 开头。 |
| `argumentPrefixes` | `Record<string, string>` | （可选）转发前消费并剥离的必需前缀子命令（例如 `/gemini account 1` 中的 `account`）。 |
| `completions` | `Record<string, string[] \| { jsonKeys: string }>` | （可选）每个别名的自动补全源。可以是静态字符串数组，也可以指向 agent 目录下的 JSON 文件名（读取其顶层键）。 |

---

## 🧪 自动化测试

针对真实的 Pi 运行环境与各种边界场景进行了详尽测试：
- 命令解析、递归别名链、循环引用拦截、参数透传与引号保留 (`test.cjs`)。
- 真实的 Pi 自动补全提供者集成与前缀匹配验证 (`completion-test.mjs`)。
- 分栏 TUI 渲染、视口边界、原子存储排他锁与备份测试 (`manager-test.mjs`)。
- 真实的 Pi 扩展命令上下文派发与执行隔离测试 (`integration-test.mjs`)。

```bash
node test.cjs
node completion-test.mjs <pi-package-root-path>
node manager-test.mjs <pi-package-root-path>
node integration-test.mjs <pi-package-root-path> <pi-agent-dir-path>
```

---

## 📄 开源许可证

本项目采用 [MIT](LICENSE) 许可证 © 2026 [kongzhuww](https://github.com/kongzhuww)。
