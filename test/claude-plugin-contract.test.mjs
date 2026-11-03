import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const claudePluginRoot = resolve(root, 'claude/dia-cdp');

// Codex 매니페스트가 원본이므로 Claude 매니페스트는 이 필드들을 그대로 따라야 한다.
const SHARED_METADATA_FIELDS = [
  'name',
  'version',
  'description',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
];

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function assertRelativeLink(linkPath, targetPath) {
  const link = resolve(claudePluginRoot, linkPath);

  assert.ok(lstatSync(link).isSymbolicLink(), `${linkPath} must be a symlink`);
  assert.equal(isAbsolute(readlinkSync(link)), false, `${linkPath} must use a relative target`);
  assert.equal(realpathSync(link), realpathSync(resolve(root, targetPath)));
}

describe('Claude Code plugin package', () => {
  it('mirrors the Codex manifest metadata', () => {
    const codex = readJson('.codex-plugin/plugin.json');
    const claude = readJson('claude/dia-cdp/.claude-plugin/plugin.json');

    SHARED_METADATA_FIELDS.forEach((field) => assert.deepEqual(claude[field], codex[field], field));
    assert.equal(claude.displayName, codex.interface.displayName);
  });

  it('defines a root marketplace that installs the Claude plugin directory', () => {
    const marketplace = readJson('.claude-plugin/marketplace.json');
    const entries = marketplace.plugins.map(({ name, source }) => ({ name, source }));

    assert.equal(marketplace.name, readJson('.agents/plugins/marketplace.json').name);
    assert.deepEqual(entries, [{ name: 'dia-cdp', source: './claude/dia-cdp' }]);
  });

  it('links the original Codex skill instead of copying it', () => {
    assertRelativeLink('skills/dia-cdp', 'skills/dia-cdp');
  });

  it('links every runtime wrapper and the directories they resolve', () => {
    const wrappers = readdirSync(resolve(root, 'bin')).sort();

    assert.deepEqual(readdirSync(resolve(claudePluginRoot, 'bin')).sort(), wrappers);
    wrappers.forEach((name) => assertRelativeLink(`bin/${name}`, `bin/${name}`));
    assertRelativeLink('src', 'src');
    assertRelativeLink('extension', 'extension');
  });

  it('runs the skill wrappers through the Claude plugin directory', () => {
    const scriptsDir = resolve(claudePluginRoot, 'skills/dia-cdp/scripts');
    const usage = (name) => execFileSync(resolve(scriptsDir, name), ['--help'], { encoding: 'utf8' });

    assert.match(usage('dia-browser'), /^dia-extension <command>/);
    assert.match(usage('dia-extension'), /^dia-extension <command>/);
    assert.match(usage('dia-automation'), /^dia-automation </);
    assert.match(usage('dia-cdp'), /^dia-cdp \[--restart\]/);
  });
});
