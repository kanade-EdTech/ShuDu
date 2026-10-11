import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');

test('entry uses external CSS and a classic local script', async () => {
  const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\.\/style\.css"\s*\/>/);
  assert.match(html, /<script src="\.\/platform\.js"><\/script>\s*<script src="\.\/domain\.js">/);
  assert.match(html, /<script src="\.\/domain\.js"><\/script>\s*<script src="\.\/puzzle-bank-4x4\.js"><\/script>\s*<script src="\.\/puzzle-bank-9x9\.js"><\/script>\s*<script src="\.\/storage\.js"><\/script>\s*<script src="\.\/media\.js"><\/script>\s*<script src="\.\/audio-library\.js"><\/script>\s*<script src="\.\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<style>/);
  assert.doesNotMatch(html, /<script\b[^>]*\btype=["']module["']/i);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
});

test('simple mode keeps the fixed 1-4 avatar mapping', async () => {
  const css = await readFile(path.join(projectRoot, 'style.css'), 'utf8');
  const mappings = [
    ['1', '1洛天依.png'],
    ['2', '2乐正绫.png'],
    ['3', '3星尘.jpg'],
    ['4', '4言和.png']
  ];

  for (const [value, file] of mappings) {
    assert.ok(css.includes('.char-' + value + ' { background-image: url("./公式服头像/' + file + '"); }'));
    const info = await stat(path.join(projectRoot, '公式服头像', file));
    assert.ok(info.isFile());
  }
});

test('all source release entries exist', async () => {
  const entries = ['index.html', 'style.css', 'domain.js', 'puzzle-bank-4x4.js', 'puzzle-bank-9x9.js', 'storage.js', 'media.js', 'app.js', 'assets', '公式服头像'];
  for (const entry of entries) {
    await stat(path.join(projectRoot, entry));
  }
});
