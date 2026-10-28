const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const { join } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, 'index.ts'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export default async function/gm, 'async function loadAliases').replace(/^export /gm, '');
const commands = new Map();
let targets = [{ name: 'extension-toggle', source: 'extension' }];
const sent = [];
const api = { registerCommand: (name, command) => commands.set(name, command), getCommands: () => targets, sendUserMessage: (text, options) => sent.push({ text, options }) };
const sandbox = { api };
vm.createContext(sandbox);
vm.runInContext(stripTypeScriptTypes(source) + '\nconst aliases = parseAliases({version:1,aliases:{switch:"/extension-toggle use",short:"/switch"}}); registerAliases(api,aliases);', sandbox);
const evaluate = text => vm.runInContext(text, sandbox);
assert.equal(evaluate('resolveAlias(aliases,"switch","platform")'), '/extension-toggle use platform');
assert.equal(evaluate('resolveAlias(aliases,"short","daily")'), '/extension-toggle use daily');
assert.equal(evaluate('resolveAlias(aliases,"switch",\'"two words"\')'), '/extension-toggle use "two words"');
for (const expr of [
  'parseAliases({version:2,aliases:{}})',
  'parseAliases({version:1,aliases:{reload:"/target"}})',
  'parseAliases({version:1,aliases:{x:"echo hi"}})',
  'parseAliases({version:1,aliases:{x:"/x"}})',
  'parseAliases({version:1,aliases:{x:"/y",y:"/x"}})',
  'parseAliases({version:1,aliases:{x:"/target\\nunsafe"}})',
]) assert.throws(() => evaluate(expr));
(async () => {
  const errors = [];
  const ctx = { ui: { notify: text => errors.push(text) } }; // Actual contexts have no sendUserMessage.
  await commands.get('switch').handler('platform', ctx);
  assert.equal(sent[0].text, '/extension-toggle use platform');
  assert.equal(sent[0].options.expandPromptTemplates, true);
  targets = [];
  await commands.get('switch').handler('platform', ctx);
  assert.equal(sent.length, 1);
  assert.match(errors.at(-1), /unavailable/);
  targets = [{ name: 'extension-toggle', source: 'prompt' }];
  await commands.get('switch').handler('platform', ctx);
  assert.equal(sent.length, 1);
  targets = [{ name: 'antigravity.accounts', source: 'extension' }];
  evaluate('const gemAliases = parseAliases({version:1,aliases:{gemini:"/antigravity.accounts switch"}}); const gemPrefixes = parseArgumentPrefixes({gemini:"account"}, gemAliases); registerAliases(api, gemAliases, undefined, gemPrefixes);');
  for (const number of ['1', '2', '3', '4']) {
    await commands.get('gemini').handler(`account ${number}`, ctx);
    assert.equal(sent.at(-1).text, `/antigravity.accounts switch ${number}`);
  }
  const count = sent.length;
  for (const args of ['', 'account', 'remove 1']) await commands.get('gemini').handler(args, ctx);
  assert.equal(sent.length, count);
  assert.throws(() => evaluate('parseArgumentPrefixes({unknown:"account"}, gemAliases)'));
  console.log('PASS: fixed arguments, raw quotes, chains, cycle/invalid/reserved rejection, missing target safety, dotted commands, all four gemini account mappings and prefix validation');
})().catch(error => { console.error(error); process.exitCode = 1; });
