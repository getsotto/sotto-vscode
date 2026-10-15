import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const archive = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/);
const entrySet = new Set(entries);

for (const required of [
  'extension/package.json',
  'extension/readme.md',
  'extension/LICENSE.txt',
  'extension/changelog.md',
  'extension/dist/extension.js',
  'extension/node_modules/jsonc-parser/package.json',
]) {
  assert.ok(entrySet.has(required), `VSIX is missing ${required}`);
}

for (const entry of entries) {
  assert.doesNotMatch(
    entry,
    /^extension\/(?:src|test|spike|scripts|docs)(?:\/|$)/,
    `VSIX contains development files: ${entry}`,
  );
}

const packagedManifest = JSON.parse(
  execFileSync('unzip', ['-p', archive, 'extension/package.json'], { encoding: 'utf8' }),
);
for (const key of ['name', 'publisher', 'version', 'engines', 'license']) {
  assert.deepEqual(packagedManifest[key], manifest[key], `VSIX ${key} differs from package.json`);
}
assert.equal(manifest.publisher, 'getsotto');
assert.equal(manifest.name, 'sotto-vscode');
assert.equal(manifest.version, '0.1.0');
assert.equal(manifest.preview, true);

console.log(`Verified ${path.basename(archive)}: metadata and release file set are correct.`);
