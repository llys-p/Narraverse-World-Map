import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.cjs', import.meta.url), 'utf8');
const launcher = readFileSync(new URL('../Start-World.cmd', import.meta.url), 'utf8');
const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');

test('standalone server reads only its project-local env file', () => {
  assert.match(server, /const ENV_PATH = path\.join\(__dirname, '\.env'\);/);
  assert.doesNotMatch(server, /D:[/\\]Narraverse2\.0-fusion/);
});

test('launcher starts from its own directory without the original artifact path', () => {
  assert.match(launcher, /cd \/d "%~dp0"/i);
  assert.doesNotMatch(launcher, /D:\\Narraverse2\.0\\artifacts/);
});

test('secrets are ignored while source is not blanket-ignored', () => {
  const lines = ignore.split(/\r?\n/).map(line => line.trim());
  assert.ok(lines.includes('.env'));
  assert.ok(lines.includes('.env.*'));
  assert.ok(lines.includes('!.env.example'));
  assert.ok(!lines.includes('*'));
});
