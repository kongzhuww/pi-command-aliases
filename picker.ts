import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

export class CommandPicker {
  private index = 0;
  private query = "";
  private pageSize = 8;
  constructor(private choices: string[], private theme: any,
    private done: (value: string | undefined) => void, private height: () => number) {}
  invalidate() {}
  private get filtered() { return this.choices.filter(value => value.toLowerCase().includes(this.query.toLowerCase())); }
  handleInput(data: string) {
    const values = this.filtered;
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) { this.done(undefined); return; }
    if (matchesKey(data, Key.enter)) { if (values[this.index]) this.done(values[this.index]); return; }
    if (matchesKey(data, Key.up)) { this.index = Math.max(0, this.index - 1); return; }
    if (matchesKey(data, Key.down)) { this.index = Math.min(Math.max(0, values.length - 1), this.index + 1); return; }
    if (data === "\x1b[5~") { this.index = Math.max(0, this.index - this.pageSize); return; }
    if (data === "\x1b[6~") { this.index = Math.min(Math.max(0, values.length - 1), this.index + this.pageSize); return; }
    if (matchesKey(data, Key.ctrl("u"))) this.query = "";
    else if (matchesKey(data, Key.backspace)) this.query = Array.from(this.query).slice(0, -1).join("");
    else if (data && !/[\x00-\x1f\x7f]/.test(data)) this.query += data;
    else return;
    this.index = 0;
  }
  render(width: number): string[] {
    const values = this.filtered;
    this.index = Math.min(this.index, Math.max(0, values.length - 1));
    this.pageSize = Math.max(1, Math.min(12, this.height() - 8));
    // Recalculate the viewport on every render, including terminal resize.
    const start = Math.max(0, Math.min(this.index - this.pageSize + 1, Math.max(0, values.length - this.pageSize)));
    const end = Math.min(values.length, start + this.pageSize);
    const lines = [this.theme.fg("accent", "选择目标扩展命令"), this.theme.fg("muted", `搜索: ${this.query || "直接输入筛选"} | ${values.length ? this.index + 1 : 0}/${values.length}`), ""];
    for (let i = start; i < end; i++) lines.push(this.theme.fg(i === this.index ? "accent" : "text", `${i === this.index ? ">" : " "} ${values[i]}`));
    if (!values.length) lines.push(this.theme.fg("muted", "没有匹配命令"));
    lines.push("", this.theme.fg("muted", `↑↓ 选择 | PgUp/PgDn 翻页 | Enter 确认 | Esc 取消`), this.theme.fg("muted", `${start + (values.length ? 1 : 0)}-${end}/${values.length} | Backspace 删除搜索 | Ctrl+U 清空`));
    return lines.map(line => truncateToWidth(line, Math.max(1, width)));
  }
}

export async function pickTargetCommand(ctx: ExtensionCommandContext, choices: string[]): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>((tui, theme, _keys, done) => {
    const picker = new CommandPicker(choices, theme, done, () => tui.terminal.rows);
    return {
      render: width => picker.render(width), invalidate: () => picker.invalidate(),
      handleInput: data => { picker.handleInput(data); tui.requestRender(); },
    };
  });
}
