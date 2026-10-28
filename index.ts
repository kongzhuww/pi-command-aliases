import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAliasCompletions, withAliasCompletions, type AliasCompletions } from "./completion.ts";
import { manageAliases } from "./manager.ts";

const RESERVED = new Set(["aliases", "reload", "quit", "exit", "model", "settings", "help", "new", "resume", "tree", "fork", "compact", "login", "logout", "export", "share", "session", "name", "copy", "hotkeys", "changelog"]);
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9:_.-]*$/;

export function parseAliases(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Aliases config must be an object");
  const config = value as { version?: unknown; aliases?: unknown };
  if (config.version !== 1 || !config.aliases || typeof config.aliases !== "object" || Array.isArray(config.aliases)) {
    throw new Error("Expected { version: 1, aliases: { name: '/target fixed-args' } }");
  }
  const aliases: Record<string, string> = Object.create(null);
  for (const [name, target] of Object.entries(config.aliases)) {
    if (!NAME.test(name) || RESERVED.has(name)) throw new Error(`Invalid or reserved alias: ${name}`);
    if (typeof target !== "string" || /[\x00-\x1f\x7f]/.test(target)) throw new Error(`Invalid target for ${name}`);
    const normalized = target.trim();
    const command = normalized.split(/\s+/, 1)[0];
    if (!command.startsWith("/") || !NAME.test(command.slice(1))) throw new Error(`Expected a slash-command target for ${name}`);
    aliases[name] = normalized;
  }
  for (const name of Object.keys(aliases)) resolveAlias(aliases, name, "");
  return aliases;
}

export function parseArgumentPrefixes(value: unknown, aliases: Record<string, string>): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("argumentPrefixes must be an object");
  const prefixes: Record<string, string> = Object.create(null);
  for (const [alias, prefix] of Object.entries(value)) {
    if (!Object.hasOwn(aliases, alias) || typeof prefix !== "string" || !NAME.test(prefix)) {
      throw new Error(`Invalid argument prefix for ${alias}`);
    }
    prefixes[alias] = prefix;
  }
  return prefixes;
}

export function resolveAlias(aliases: Record<string, string>, name: string, args: string, prefixes: Record<string, string> = {}): string {
  const visited = new Set<string>();
  let command = name;
  let suffix = args;
  while (Object.hasOwn(aliases, command)) {
    if (visited.has(command)) throw new Error(`Alias cycle at /${command}`);
    visited.add(command);
    const argumentPrefix = Object.hasOwn(prefixes, command) ? prefixes[command] : undefined;
    if (argumentPrefix) {
      const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(suffix);
      if (!match || match[1] !== argumentPrefix || !match[2]?.trim()) {
        throw new Error(`Usage: /${command} ${argumentPrefix} <arguments>`);
      }
      suffix = match[2];
    }
    const target = aliases[command];
    const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(target);
    if (!match) throw new Error(`Invalid target for ${command}`);
    command = match[1];
    suffix = [match[2], suffix].filter(Boolean).join(" ");
  }
  return `/${command}${suffix ? ` ${suffix}` : ""}`;
}

export function registerAliases(pi: ExtensionAPI, aliases: Record<string, string>, complete?: AliasCompletions, prefixes: Record<string, string> = {}) {
  for (const name of Object.keys(aliases)) {
    pi.registerCommand(name, {
      description: `Alias: /${name} -> ${aliases[name]} (arguments forwarded)`,
      getArgumentCompletions: complete ? prefix => complete(name, prefix) : undefined,
      async handler(args, ctx) {
        try {
          const text = resolveAlias(aliases, name, args, prefixes);
          const target = text.slice(1).split(/\s+/, 1)[0];
          // Only extension commands are supported in v0.1. Do not send a
          // missing command, builtin, skill, or template to the language model.
          if (!pi.getCommands().some(command => command.name === target && command.source === "extension")) {
            throw new Error(`Target extension command /${target} is unavailable; nothing was sent to the model`);
          }
          pi.sendUserMessage(text, { expandPromptTemplates: true });
          // ExtensionAPI dispatch is fire-and-forget; Pi reports async failures.
          // The target may reload the runtime; never reuse ctx after dispatch.
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        }
      },
    });
  }
}

export default async function (pi: ExtensionAPI) {
  const configPath = join(getAgentDir(), "command-aliases.json");
  const loadedAliases = new Set<string>();
  const validate = (config: any, checkTargets = false) => {
    const aliases = parseAliases(config);
    parseArgumentPrefixes(config.argumentPrefixes, aliases);
    createAliasCompletions(config.completions, aliases, getAgentDir());
    if (checkTargets) for (const name of Object.keys(aliases)) {
      const target = resolveAlias(aliases, name, "").slice(1).split(/\s+/, 1)[0];
      if (!pi.getCommands().some(command => command.name === target && command.source === "extension")) {
        throw new Error(`目标扩展命令 /${target} 不可用，请先启用对应扩展`);
      }
    }
  };
  pi.registerCommand("aliases", {
    description: "可视化管理命令别名：左右对照、新建、编辑、删除、补全设置",
    handler: async (_args, ctx) => {
      try {
        await manageAliases(pi, ctx, configPath, {
          validate, loadedAliases,
          async examples(config, name) {
            const aliases = parseAliases(config);
            const prefixes = parseArgumentPrefixes(config.argumentPrefixes, aliases);
            const complete = createAliasCompletions(config.completions, aliases, getAgentDir());
            const values = await complete(name, "");
            const args = values.length ? values.slice(0, 4).map(item => item.value) : [`${prefixes[name] ? prefixes[name] + " " : ""}<参数>`];
            return args.map(argument => {
              let right: string;
              try { right = resolveAlias(aliases, name, argument, prefixes); }
              catch (error) { right = error instanceof Error ? error.message : String(error); }
              return { left: `/${name} ${argument}`, right };
            });
          },
        });
      } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
    },
  });
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  const config = JSON.parse(raw);
  const aliases = parseAliases(config);
  for (const name of Object.keys(aliases)) loadedAliases.add(name);
  const complete = createAliasCompletions(config.completions, aliases, getAgentDir());
  registerAliases(pi, aliases, complete, parseArgumentPrefixes(config.argumentPrefixes, aliases));
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode === "tui" && typeof ctx.ui.addAutocompleteProvider === "function") {
      ctx.ui.addAutocompleteProvider(base => withAliasCompletions(base, aliases, complete));
    }
  });
}
