import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { readAliasConfig, saveAliasConfig } from "./storage.ts";
import { pickTargetCommand } from "./picker.ts";

type Config = { version: number; aliases: Record<string, string>; argumentPrefixes?: Record<string, string>; completions?: Record<string, any>; [key: string]: unknown };
type Action = "new" | "edit" | "delete" | "search" | "save" | "close";
export interface AliasRow { name: string; left: string; right: string; examples: { left: string; right: string }[] }
interface Dependencies {
  validate(config: unknown, checkTargets?: boolean): void;
  examples(config: Config, name: string): Promise<{ left: string; right: string }[]>;
  loadedAliases: Set<string>;
}

export class AliasPanel {
  private index: number;
  constructor(private rows: AliasRow[], selected: string | undefined, private dirty: boolean, private filter: string,
    private theme: any, private done: (result: { action: Action; selected?: string }) => void, private height: () => number) {
    this.index = Math.max(0, rows.findIndex(row => row.name === selected));
  }
  invalidate() {}
  handleInput(data: string) {
    if (matchesKey(data, Key.up)) this.index = Math.max(0, this.index - 1);
    else if (matchesKey(data, Key.down)) this.index = Math.min(Math.max(0, this.rows.length - 1), this.index + 1);
    else {
      const action: Action | undefined = matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) ? "close"
        : matchesKey(data, Key.ctrl("s")) ? "save" : data === "n" ? "new" : data === "/" ? "search"
        : matchesKey(data, Key.enter) || data === "e" ? "edit"
        : data === "d" || matchesKey(data, Key.delete) ? "delete" : undefined;
      if (action) this.done({ action, selected: this.rows[this.index]?.name });
    }
  }
  render(width: number): string[] {
    const clip = (text: string) => truncateToWidth(text, Math.max(1, width));
    const color = (name: string, text: string) => this.theme.fg(name, text);
    const result = [color("accent", `命令别名管理${this.dirty ? " * 未保存" : ""}`), color("muted", `筛选: ${this.filter || "全部"} | ${this.rows.length} 条规则`), ""];
    const twoColumns = width >= 72;
    const leftWidth = Math.max(8, Math.floor((width - 5) * 0.43));
    const pair = (left: string, right: string) => {
      if (!twoColumns) return [clip(left), clip("  -> " + right)];
      const l = truncateToWidth(left, leftWidth);
      return [clip(l + " ".repeat(Math.max(0, leftWidth - visibleWidth(l))) + " | " + right)];
    };
    result.push(...pair("你输入的命令", "实际执行的命令"));
    result.push(color("border", "-".repeat(Math.max(1, width))));
    const count = Math.max(1, Math.min(10, Math.floor((this.height() - 15) / (twoColumns ? 1 : 2))));
    const start = Math.max(0, this.index - count + 1);
    for (const [offset, row] of this.rows.slice(start, start + count).entries()) {
      const selected = start + offset === this.index;
      const lines = pair(`${selected ? ">" : " "} ${row.left}`, row.right);
      result.push(...lines.map(line => color(selected ? "accent" : "text", line)));
    }
    if (!this.rows.length) result.push(color("muted", "暂无匹配规则，按 n 新建"));
    const selected = this.rows[this.index];
    result.push("", color("muted", "预览（只显示，不执行）"));
    for (const example of selected?.examples.slice(0, 3) ?? []) result.push(...pair(example.left, example.right).map(line => color("muted", line)));
    result.push("", color("muted", "↑↓ 选择 | n 新建 | Enter 编辑 | d 删除 | / 搜索"), color("muted", "Ctrl+S 保存 | Esc 关闭 | 保存后 /reload 生效"));
    return result.map(clip);
  }
}

export async function manageAliases(pi: ExtensionAPI, ctx: ExtensionCommandContext, path: string, dependencies: Dependencies) {
  if (ctx.mode !== "tui") { ctx.ui.notify("/aliases 需要交互式 TUI", "error"); return; }
  await ctx.waitForIdle();
  const expected = await readAliasConfig(path);
  const draft: Config = expected === null ? { version: 1, aliases: {} } : JSON.parse(expected);
  dependencies.validate(draft);
  const initial = JSON.stringify(draft);
  let selected: string | undefined;
  let filter = "";
  const assertValid = (config: Config) => {
    dependencies.validate(config, true);
    const commands = pi.getCommands();
    for (const name of Object.keys(config.aliases)) {
      if (!dependencies.loadedAliases.has(name) && commands.some(command => command.name === name)) throw new Error(`命令 /${name} 已存在，请换一个别名`);
    }
  };
  while (true) {
    const dirty = JSON.stringify(draft) !== initial;
    const rows: AliasRow[] = [];
    for (const name of Object.keys(draft.aliases).sort()) {
      const prefix = draft.argumentPrefixes?.[name];
      const left = `/${name}${prefix ? " " + prefix : ""} <参数>`;
      const right = draft.aliases[name] + " <参数>";
      if (!`${left} ${right}`.toLowerCase().includes(filter.toLowerCase())) continue;
      rows.push({ name, left, right, examples: await dependencies.examples(draft, name) });
    }
    const result = await ctx.ui.custom<{ action: Action; selected?: string }>((tui, theme, _keys, done) => {
      const panel = new AliasPanel(rows, selected, dirty, filter, theme, done, () => tui.terminal.rows);
      return { render: width => panel.render(width), invalidate: () => panel.invalidate(), handleInput: data => { panel.handleInput(data); tui.requestRender(); } };
    });
    selected = result.selected;
    if (result.action === "close") {
      if (!dirty || await ctx.ui.confirm("放弃未保存修改？", "本次修改不会写入配置文件。")) return;
      continue;
    }
    if (result.action === "search") {
      const value = await ctx.ui.input("筛选别名或目标命令（留空显示全部）", filter);
      if (value !== undefined) filter = value;
      continue;
    }
    if (result.action === "delete" && selected) {
      if (await ctx.ui.confirm(`删除 /${selected}？`, "只删除别名，不卸载目标扩展。Ctrl+S 后才写入文件。")) {
        delete draft.aliases[selected];
        if (draft.argumentPrefixes) delete draft.argumentPrefixes[selected];
        if (draft.completions) delete draft.completions[selected];
      }
      continue;
    }
    if (result.action === "save") {
      if (!dirty) { ctx.ui.notify("没有需要保存的修改", "info"); continue; }
      try {
        assertValid(draft);
        if (!(await ctx.ui.confirm("保存别名配置？", "写入前自动备份原文件；不会执行任何别名目标。"))) continue;
        const backup = await saveAliasConfig(path, expected, draft);
        ctx.ui.notify(`已保存 ${path}${backup ? `；备份 ${backup}` : ""}`, "info");
      } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); continue; }
      if (await ctx.ui.confirm("现在重载？", "重载后新别名和补全生效；不重载则稍后运行 /reload。")) await ctx.reload();
      return;
    }
    if (result.action !== "new" && result.action !== "edit") continue;
    if (result.action === "edit" && !selected) continue;
    try {
      const previous = result.action === "edit" ? selected : undefined;
      const rawName = await ctx.ui.input("别名（不含 /，例如 switch）", previous ?? "");
      if (rawName === undefined) continue;
      const name = (rawName.trim() || previous || "").replace(/^\//, "");
      if (name !== previous && Object.hasOwn(draft.aliases, name)) throw new Error(`别名 /${name} 已存在`);
      let target: string | undefined;
      const method = await ctx.ui.select("目标命令", ["手动输入完整命令", "从已加载扩展命令选择"]);
      if (!method) continue;
      if (method === "从已加载扩展命令选择") {
        const choices = pi.getCommands().filter(command => command.source === "extension" && !Object.hasOwn(draft.aliases, command.name) && command.name !== "aliases").map(command => `/${command.name}`).sort();
        const picked = await pickTargetCommand(ctx, choices);
        if (!picked) continue;
        target = await ctx.ui.input("完整目标命令（可追加固定参数，留空保留）", picked);
        if (target === "") target = picked;
      } else {
        target = await ctx.ui.input("完整目标命令（留空保留），例如 /extension-toggle use", previous ? draft.aliases[previous] : "");
        if (target === "" && previous) target = draft.aliases[previous];
      }
      if (target === undefined) continue;
      const prefixInput = await ctx.ui.input("参数前缀（留空保留，输入 - 清空），例如 account", previous ? draft.argumentPrefixes?.[previous] ?? "" : "");
      if (prefixInput === undefined) continue;
      const prefix = prefixInput.trim() === "-" ? "" : prefixInput.trim() || (previous ? draft.argumentPrefixes?.[previous] ?? "" : "");
      const source = await ctx.ui.select("补全候选来源", ["保留原设置", "无补全", "固定候选", "JSON 文件顶层键"]);
      if (!source) continue;
      let completion: unknown = previous ? draft.completions?.[previous] : undefined;
      if (source === "无补全") completion = undefined;
      if (source === "固定候选") {
        const input = await ctx.ui.input('候选 JSON 数组，例如 ["account 1", "account 2"]', JSON.stringify(Array.isArray(completion) ? completion : []));
        if (input === undefined) continue;
        completion = JSON.parse(input || JSON.stringify(Array.isArray(completion) ? completion : []));
      }
      if (source === "JSON 文件顶层键") {
        const input = await ctx.ui.input("agent 目录中的 JSON 文件名", (completion as any)?.jsonKeys ?? "extension-toggle-collections.json");
        if (input === undefined) continue;
        completion = { jsonKeys: input.trim() || (completion as any)?.jsonKeys || "extension-toggle-collections.json" };
      }
      const next = structuredClone(draft);
      if (previous) {
        delete next.aliases[previous];
        if (next.argumentPrefixes) delete next.argumentPrefixes[previous];
        if (next.completions) delete next.completions[previous];
      }
      next.aliases[name] = target.trim();
      if (prefix.trim()) (next.argumentPrefixes ??= {})[name] = prefix.trim();
      if (completion !== undefined) (next.completions ??= {})[name] = completion;
      assertValid(next);
      Object.assign(draft, next);
      selected = name;
    } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
  }
}
