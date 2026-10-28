// Offline integration: real Pi dispatch and real extension-toggle handler.
// All settings writes are confined to a fresh temporary agent directory.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const [piRoot, realAgentDir] = process.argv.slice(2);
if (!piRoot || !realAgentDir) throw new Error('Usage: node integration-test.mjs <pi-package-root> <agent-dir>');
const temporary = await mkdtemp(join(tmpdir(), 'pi-alias-test-'));
const previousDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = temporary;
try {
  const { loadExtensions } = await import(pathToFileURL(join(piRoot, 'dist/core/extensions/loader.js')).href);
  const { AgentSession } = await import(pathToFileURL(join(piRoot, 'dist/core/agent-session.js')).href);
  const { ExtensionRunner } = await import(pathToFileURL(join(piRoot, 'dist/core/extensions/runner.js')).href);
  await writeFile(join(temporary, 'command-aliases.json'), JSON.stringify({ version: 1, aliases: { switch: '/extension-toggle use' }, completions: { switch: { jsonKeys: 'extension-toggle-collections.json' } } }));
  await writeFile(join(temporary, 'settings.json'), JSON.stringify({ theme: 'light', packages: [], skills: [] }));
  await writeFile(join(temporary, 'extension-toggle-collections.json'), JSON.stringify({ platform: { packages: [], skills: ['!*'] }, daily: { packages: [], skills: [] } }));
  const loaded = await loadExtensions([
    join(dirname(fileURLToPath(import.meta.url)), 'index.ts'),
    join(realAgentDir, 'npm/node_modules/@petechu/pi-extension-toggle/index.ts'),
  ], temporary);
  assert.deepEqual(loaded.errors, []);
  assert.ok(loaded.extensions.every(extension => extension.tools.size === 0));
  const commands = new Map(loaded.extensions.flatMap(extension => [...extension.commands]));
  assert.ok(commands.has('switch') && commands.has('extension-toggle'));
  loaded.runtime.getCommands = () => [...commands.keys()].map(name => ({ name, source: 'extension' }));
  let prompts = 0;
  let dispatched;
  const notifications = [];
  // Use the real factory, not a fabricated context with extra methods.
  const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, temporary, {}, {});
  const wrappers = [];
  runner.setUIContext({ notify: (message, level) => notifications.push({ message, level }), confirm: async () => false, addAutocompleteProvider: factory => wrappers.push(factory) }, 'tui');
  runner.waitForIdleFn = async () => {};
  const context = runner.createCommandContext();
  assert.equal(typeof context.sendUserMessage, 'undefined');
  for (const handler of loaded.extensions[0].handlers.get('session_start') ?? []) await handler({ type: 'session_start' }, context);
  assert.equal(wrappers.length, 1);
  const candidates = await commands.get('switch').getArgumentCompletions('p');
  assert.equal(candidates[0].value, 'platform');
  const session = Object.create(AgentSession.prototype);
  session._extensionRunner = runner;
  const pending = [];
  loaded.runtime.sendUserMessage = (text, options) => { pending.push(session.sendUserMessage(text, options)); };
  session.prompt = async (text, options) => {
    prompts++;
    assert.equal(options.expandPromptTemplates, true);
    dispatched = text;
    assert.equal(await session._tryExecuteExtensionCommand(text), true, 'target must be handled before any model request');
  };
  assert.equal(await session._tryExecuteExtensionCommand('/switch platform'), true);
  await Promise.all(pending.splice(0));
  assert.equal(dispatched, '/extension-toggle use platform');
  assert.equal(prompts, 1);
  let saved = JSON.parse(await readFile(join(temporary, 'settings.json'), 'utf8'));
  assert.deepEqual(saved.skills, ['!*']);
  assert.equal(saved.theme, 'light');
  assert.ok(notifications.some(item => item.message.includes('Applied collection "platform"')));
  assert.ok(!notifications.some(item => item.level === 'error'), JSON.stringify(notifications));
  assert.equal(await session._tryExecuteExtensionCommand('/switch daily'), true);
  await Promise.all(pending.splice(0));
  saved = JSON.parse(await readFile(join(temporary, 'settings.json'), 'utf8'));
  assert.deepEqual(saved.skills, []);
  commands.delete('extension-toggle'); // Hide target from the public command catalog.
  await session._tryExecuteExtensionCommand('/switch platform');
  assert.equal(prompts, 2, 'missing target must not dispatch');
  assert.equal(notifications.at(-1).level, 'error');
  console.log('PASS: actual ExtensionRunner command context (no ctx.sendUserMessage), public pi.sendUserMessage forwarding, original collection handler saves platform and restores daily; missing target blocked; no model request or live settings change');
} finally {
  if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousDir;
  await rm(temporary, { recursive: true, force: true });
}
