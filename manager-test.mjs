import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const piRoot = process.argv[2];
if (!piRoot) throw new Error('Usage: node manager-test.mjs <pi-package-root>');
const require = createRequire(join(piRoot, 'package.json'));
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url, { alias: {
  '@earendil-works/pi-coding-agent': join(piRoot, 'dist/index.js'),
  '@earendil-works/pi-tui': require.resolve('@earendil-works/pi-tui'),
} });
const root = dirname(fileURLToPath(import.meta.url));
const { AliasPanel, manageAliases } = await jiti.import(join(root, 'manager.ts'));
const { CommandPicker } = await jiti.import(join(root, 'picker.ts'));
const { saveAliasConfig } = await jiti.import(join(root, 'storage.ts'));
const { parseAliases, parseArgumentPrefixes } = await jiti.import(join(root, 'index.ts'));
const { createAliasCompletions } = await jiti.import(join(root, 'completion.ts'));
const { visibleWidth, Key } = require('@earendil-works/pi-tui');
const temporary = await mkdtemp(join(tmpdir(), 'pi-alias-manager-'));
try {
  const path = join(temporary, 'command-aliases.json');
  const initial = { version: 1, aliases: { switch: '/extension-toggle use', gemini: '/antigravity.accounts switch' }, argumentPrefixes: { gemini: 'account' }, completions: { gemini: ['account 1', 'account 2'] } };
  await writeFile(path, JSON.stringify(initial));
  const dependencies = {
    loadedAliases: new Set(['switch', 'gemini']),
    validate(config) { const aliases = parseAliases(config); parseArgumentPrefixes(config.argumentPrefixes, aliases); createAliasCompletions(config.completions, aliases, temporary); },
    examples: async () => [{ left: '/gemini account 1', right: '/antigravity.accounts switch 1' }],
  };
  const api = { getCommands: () => [{ name: 'extension-toggle', source: 'extension' }, { name: 'antigravity.accounts', source: 'extension' }, { name: 'aliases', source: 'extension' }] };
  const notices = [];
  const run = async (actions, inputs = [], selections = [], confirms = []) => {
    const context = { mode: 'tui', waitForIdle: async () => {}, reload: async () => { throw new Error('unexpected reload'); }, ui: {
      custom: async () => { assert.ok(actions.length, 'unexpected panel iteration'); return actions.shift(); },
      input: async () => inputs.shift(), select: async () => selections.shift(), confirm: async () => confirms.shift() ?? false,
      notify: (text, level) => notices.push({ text, level }),
    } };
    await manageAliases(api, context, path, dependencies);
  };
  await run([{ action: 'new' }, { action: 'save' }], ['quick', '/extension-toggle use', '', '["daily","platform"]'], ['手动输入完整命令', '固定候选'], [true, false]);
  let saved = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(saved.aliases.quick, '/extension-toggle use');
  assert.deepEqual(saved.completions.quick, ['daily', 'platform']);
  assert.ok((await readdir(temporary)).some(name => name.includes('.bak-')));
  assert.ok(!notices.some(notice => notice.level === 'error'), JSON.stringify(notices));
  await run([{ action: 'new' }, '/antigravity.accounts', { action: 'save' }], ['picked', '', ''], ['从已加载扩展命令选择', '无补全'], [true, false]);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).aliases.picked, '/antigravity.accounts');
  const beforeDelete = await readFile(path, 'utf8');
  await run([{ action: 'delete', selected: 'quick' }, { action: 'close' }], [], [], [true, true]);
  assert.equal(await readFile(path, 'utf8'), beforeDelete, 'discard must not write');
  await run([{ action: 'edit', selected: 'gemini' }, { action: 'save' }], ['', '', '-'], ['手动输入完整命令', '无补全'], [true, false]);
  saved = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(saved.aliases.gemini, '/antigravity.accounts switch');
  assert.equal(saved.argumentPrefixes.gemini, undefined);
  assert.equal(saved.completions.gemini, undefined);
  await run([{ action: 'new' }, { action: 'close' }], [undefined]);
  const expected = await readFile(path, 'utf8');
  await writeFile(path, 'external modification');
  await assert.rejects(saveAliasConfig(path, expected, initial), /其他会话/);
  assert.equal(await readFile(path, 'utf8'), 'external modification');
  await assert.rejects(access(path + '.lock'));
  await writeFile(path + '.lock', 'test lock');
  await assert.rejects(saveAliasConfig(path, 'external modification', initial), /锁定/);
  await rm(path + '.lock');
  await saveAliasConfig(path, 'external modification', initial);
  let action;
  const panel = new AliasPanel([
    { name: 'switch', left: '/switch <参数>', right: '/extension-toggle use <参数>', examples: [] },
    { name: 'gemini', left: '/gemini account <参数>', right: '/antigravity.accounts switch <参数>', examples: [{ left: '/gemini account 1', right: '/antigravity.accounts switch 1' }] },
  ], undefined, true, '', { fg: (_name, text) => text }, result => { action = result; }, () => 30);
  for (const width of [24, 48, 80, 120]) for (const line of panel.render(width)) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  panel.handleInput('\x1b[B'); panel.handleInput('\r');
  assert.equal(action.action, 'edit'); assert.equal(action.selected, 'gemini');
  panel.handleInput('\x13'); assert.equal(action.action, 'save');
  panel.handleInput('\x1b'); assert.equal(action.action, 'close');
  let picked;
  let terminalRows = 24;
  const choices = Array.from({ length: 120 }, (_, i) => `/command-${String(i).padStart(3, '0')}`);
  const picker = new CommandPicker(choices, { fg: (_name, text) => text }, value => { picked = value; }, () => terminalRows);
  for (let i = 0; i < choices.length; i++) {
    const lines = picker.render(60);
    assert.ok(lines.length <= terminalRows, 'picker must fit terminal height');
    assert.ok(lines.some(line => line.startsWith('> ') && line.includes(choices[i])), `selected row ${i} must remain visible`);
    for (const line of lines) assert.ok(visibleWidth(line) <= 60);
    if (i < choices.length - 1) picker.handleInput('\x1b[B');
  }
  terminalRows = 12;
  assert.ok(picker.render(40).length <= terminalRows);
  assert.ok(picker.render(40).some(line => line.includes('> /command-119')));
  picker.handleInput('\x1b[5~');
  assert.ok(picker.render(40).some(line => line.includes('> /command-115')));
  picker.handleInput('\x1b[6~');
  picker.handleInput('\r');
  assert.equal(picked, '/command-119');
  picker.handleInput('099');
  assert.ok(picker.render(40).some(line => line.includes('> /command-099')));
  picker.handleInput('\r'); assert.equal(picked, '/command-099');
  picker.handleInput('\x15'); assert.ok(picker.render(40).some(line => line.includes('> /command-000')));
  picker.handleInput('no-match'); assert.ok(picker.render(40).some(line => line.includes('没有匹配')));
  picked = 'unchanged'; picker.handleInput('\r'); assert.equal(picked, 'unchanged');
  picker.handleInput('\x1b'); assert.equal(picked, undefined);
  const rpcNotices = [];
  await manageAliases(api, { mode: 'rpc', ui: { notify: text => rpcNotices.push(text) } }, path, dependencies);
  assert.ok(rpcNotices.length);
  console.log('PASS: create/edit/delete-discard/cancel, completion settings, blank preservation, prefix clear, atomic backup/conflict/lock protection, narrow/wide rendering, keyboard actions, non-TUI guard; no live config or target commands touched');
} finally { await rm(temporary, { recursive: true, force: true }); }
