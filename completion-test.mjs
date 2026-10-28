import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const piRoot = process.argv[2];
if (!piRoot) throw new Error('Usage: node completion-test.mjs <pi-package-root>');
const require = createRequire(join(piRoot, 'package.json'));
const { createJiti } = require('jiti');
const jiti = createJiti(import.meta.url);
const { createAliasCompletions, withAliasCompletions } = await jiti.import(join(dirname(fileURLToPath(import.meta.url)), 'completion.ts'));
const { CombinedAutocompleteProvider } = require('@earendil-works/pi-tui');
const temporary = await mkdtemp(join(tmpdir(), 'pi-alias-complete-'));
try {
  const aliases = { switch: '/extension-toggle use', gemini: '/antigravity.accounts switch' };
  const names = ['daily', 'platform', 'reverse', 'cad', 'eigenflux'];
  const file = join(temporary, 'collections.json');
  await writeFile(file, JSON.stringify(Object.fromEntries(names.map(name => [name, {}]))));
  const complete = createAliasCompletions({ switch: { jsonKeys: 'collections.json' }, gemini: ['account 1', 'account 2', 'account 3', 'account 4'] }, aliases, temporary);
  const base = new CombinedAutocompleteProvider([
    { name: 'switch', getArgumentCompletions: prefix => complete('switch', prefix) },
    { name: 'switcher', description: 'unrelated command' },
    { name: 'help' },
    { name: 'gemini', getArgumentCompletions: prefix => complete('gemini', prefix) },
  ], temporary, null);
  const provider = withAliasCompletions(base, aliases, complete);
  const options = { signal: new AbortController().signal, force: false };
  const suggest = text => provider.getSuggestions([text], 0, text.length, options);
  for (const text of ['/swit', '/switch', '/switch ']) {
    const result = await suggest(text);
    assert.ok(result);
    assert.equal(result.prefix, text);
    for (const name of names) assert.ok(result.items.some(item => item.label === `/switch ${name}`), text + ' missing ' + name);
    const platform = result.items.find(item => item.label === '/switch platform');
    const applied = provider.applyCompletion([text], 0, text.length, platform, result.prefix);
    assert.equal(applied.lines[0], '/switch platform ');
    assert.equal(applied.cursorCol, '/switch platform '.length);
  }
  for (const text of ['/gem', '/gemini ', '/gemini account ']) {
    const result = await suggest(text);
    assert.equal(result.items.filter(item => item.label.startsWith('/gemini account ')).length, 4);
    const item = result.items.find(item => item.label === '/gemini account 2');
    assert.equal(provider.applyCompletion([text], 0, text.length, item, result.prefix).lines[0], '/gemini account 2 ');
  }
  const filtered = await suggest('/switch p');
  assert.deepEqual(filtered.items.map(item => item.label), ['/switch platform']);
  const forced = await provider.getSuggestions(['/switch p'], 0, 9, { ...options, force: true });
  assert.equal(forced.items[0].label, '/switch platform');
  const other = await suggest('/help');
  assert.deepEqual(other, await base.getSuggestions(['/help'], 0, 5, options));
  assert.ok((await suggest('/swit')).items.some(item => item.value === 'switcher'));
  assert.equal(provider.shouldTriggerFileCompletion(['/help x'], 0, 7), base.shouldTriggerFileCompletion(['/help x'], 0, 7));
  assert.ok(provider.shouldTriggerFileCompletion(['/switch '], 0, 8));
  assert.deepEqual((await complete('switch', 'p')).map(item => item.value), ['platform']);
  await writeFile(file, JSON.stringify({ newest: {} }));
  assert.ok((await suggest('/swit')).items.some(item => item.label === '/switch newest'));
  await writeFile(file, 'invalid json');
  assert.equal((await complete('switch', '')).length, 0);
  assert.throws(() => createAliasCompletions({ switch: { jsonKeys: '../secret.json' } }, aliases, temporary));
  assert.throws(() => createAliasCompletions({ unknown: ['x'] }, aliases, temporary));
  const fixed = createAliasCompletions({ switch: ['daily', 'daily', 'platform'] }, aliases, temporary);
  assert.deepEqual((await fixed('switch', '')).map(item => item.value), ['daily', 'platform']);
  console.log('PASS: real Pi autocomplete provider; /swit full-command candidates; /switch arguments and filtering; apply without double slash; forced Tab; unrelated completions; live JSON refresh; invalid source safety');
} finally { await rm(temporary, { recursive: true, force: true }); }
