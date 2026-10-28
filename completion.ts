import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

type Source = string[] | { jsonKeys: string };
export type AliasCompletions = (alias: string, prefix: string) => Promise<AutocompleteItem[]>;

export function createAliasCompletions(config: unknown, aliases: Record<string, string>, agentDir: string): AliasCompletions {
  const sources: Record<string, Source> = Object.create(null);
  if (config !== undefined) {
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("completions must be an object");
    for (const [alias, source] of Object.entries(config)) {
      if (!Object.hasOwn(aliases, alias)) throw new Error(`Completion alias is not configured: ${alias}`);
      if (Array.isArray(source) && source.every(value => typeof value === "string" && value === value.trim() && /^[^\x00-\x1f\x7f]+$/.test(value))) {
        sources[alias] = source;
      } else if (source && typeof source === "object" && "jsonKeys" in source && typeof source.jsonKeys === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*\.json$/.test(source.jsonKeys)) {
        // Only a JSON filename in the agent directory, not arbitrary paths.
        sources[alias] = { jsonKeys: source.jsonKeys };
      } else throw new Error(`Invalid completion source for ${alias}`);
    }
  }
  return async (alias, prefix) => {
    const source = sources[alias];
    if (!source) return [];
    let values: string[];
    if (Array.isArray(source)) values = source;
    else {
      try {
        const raw = await readFile(join(agentDir, source.jsonKeys), "utf8");
        if (raw.length > 1_000_000) return [];
        const data = JSON.parse(raw);
        if (!data || typeof data !== "object" || Array.isArray(data)) return [];
        values = Object.keys(data).filter(value => /^[^\s\x00-\x1f\x7f]+$/.test(value));
      } catch { return []; }
    }
    return [...new Set(values)].sort().filter(value => value.startsWith(prefix)).slice(0, 1000)
      .map(value => ({ value, label: `/${alias} ${value}`, description: aliases[alias] }));
  };
}

export function withAliasCompletions(base: AutocompleteProvider, aliases: Record<string, string>, complete: AliasCompletions): AutocompleteProvider {
  return {
    triggerCharacters: base.triggerCharacters,
    async getSuggestions(lines, line, col, options) {
      const text = lines[line] ?? "";
      // Only whole commands at the beginning, with the cursor at the end.
      if (line !== 0 || lines.length !== 1 || col !== text.length || options.signal.aborted) {
        return base.getSuggestions(lines, line, col, options);
      }
      const match = /^\/([^\s]*)(?:\s+([^\r\n]*))?$/.exec(text);
      if (!match) return base.getSuggestions(lines, line, col, options);
      const [, word, argument] = match;
      const names = argument === undefined ? Object.keys(aliases).filter(name => name.startsWith(word)) : Object.hasOwn(aliases, word) ? [word] : [];
      const items = (await Promise.all(names.map(async name => (await complete(name, argument ?? "")).map(item => ({ ...item, value: `${name} ${item.value}` }))))).flat();
      if (options.signal.aborted) return null;
      const original = await base.getSuggestions(lines, line, col, { ...options, force: false });
      if (!items.length) return original;
      const expandedNames = new Set(items.map(item => item.value.split(" ", 1)[0]));
      // A full-command prefix lets the standard provider insert exactly one '/'.
      return {
        items: [...items, ...(argument === undefined && original?.prefix === text ? original.items.filter(item => !expandedNames.has(item.value)) : [])],
        prefix: text,
      };
    },
    applyCompletion: (lines, line, col, item, prefix) => base.applyCompletion(lines, line, col, item, prefix),
    shouldTriggerFileCompletion(lines, line, col) {
      const match = /^\/([^\s]+)\s/.exec((lines[line] ?? "").slice(0, col));
      return match && Object.hasOwn(aliases, match[1]) ? true : (base.shouldTriggerFileCompletion?.(lines, line, col) ?? false);
    },
  };
}
