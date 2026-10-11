import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const fixturePrefix = path.join(os.tmpdir(), 'vocal-sudoku-build-');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('platform build removes XHS audio import for both LF and Windows CRLF checkouts', async () => {
  const fixture = await mkdtemp(fixturePrefix);
  try {
    await mkdir(path.join(fixture, 'scripts'));
    await cp(new URL('../scripts/build.mjs', import.meta.url), path.join(fixture, 'scripts', 'build.mjs'));
    await mkdir(path.join(fixture, 'assets'));
    await mkdir(path.join(fixture, '公式服头像'));
    for (const entry of ['style.css', 'platform.js', 'domain.js', 'puzzle-bank-4x4.js',
      'puzzle-bank-9x9.js', 'storage.js', 'media.js', 'audio-library.js', 'app.js']) {
      await writeFile(path.join(fixture, entry), '/* build fixture */\n');
    }
    for (const newline of ['\n', '\r\n']) {
      await writeFile(path.join(fixture, 'index.html'), htmlSource.replace(/\r?\n/g, newline));
      await run(process.execPath, [path.join(fixture, 'scripts', 'build.mjs')]);
      const toy = await readFile(path.join(fixture, 'dist', 'toy', 'index.html'), 'utf8');
      const xhs = await readFile(path.join(fixture, 'dist', 'xhs', 'index.html'), 'utf8');
      assert.match(toy, /<script src="\.\/audio-library\.js"><\/script>/);
      assert.match(toy, /data-platform="toy"/);
      assert.doesNotMatch(xhs, /audio-library\.js|audio-file-input|audio-import/);
      assert.match(xhs, /data-platform="xhs"/);
      assert.match(xhs, /当前平台仅支持内置 BGM/);
    }
  } finally {
    if (!fixture.startsWith(fixturePrefix)) { throw new Error('Unexpected fixture cleanup path'); }
    await rm(fixture, { recursive: true, force: true });
  }
});
