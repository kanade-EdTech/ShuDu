import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const distRoot = path.join(projectRoot, 'dist');
const targets = ['toy', 'xhs'];
const releaseEntries = [
  'index.html',
  'style.css',
  'platform.js',
  'domain.js',
  'puzzle-bank-4x4.js',
  'puzzle-bank-9x9.js',
  'storage.js',
  'media.js',
  'audio-library.js',
  'app.js',
  'assets',
  '公式服头像'
];

function assertSafeTarget(targetPath) {
  const relative = path.relative(distRoot, targetPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to clean a path outside a named dist target: ' + targetPath);
  }
}

async function copyReleaseEntry(entry, targetDirectory) {
  const source = path.join(projectRoot, entry);
  const destination = path.join(targetDirectory, entry);
  await cp(source, destination, { recursive: true });
}

for (const target of targets) {
  const targetDirectory = path.join(distRoot, target);
  assertSafeTarget(targetDirectory);
  await rm(targetDirectory, { recursive: true, force: true });
  await mkdir(targetDirectory, { recursive: true });

  for (const entry of releaseEntries) {
    if (target === 'xhs' && entry === 'audio-library.js') { continue; }
    await copyReleaseEntry(entry, targetDirectory);
  }
  const htmlPath = path.join(targetDirectory, 'index.html');
  let html = await readFile(htmlPath, 'utf8');
  html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-platform="' + target + '">');
  if (target === 'xhs') {
    html = html.replace('  <script src="./audio-library.js"></script>\n', '');
    html = html.replace(/        <section class="card user-music-panel"[\s\S]*?<\/section>/, '<p class="prototype-note">当前平台仅支持内置 BGM</p>');
  }
  await writeFile(htmlPath, html, 'utf8');

  console.log('Built ' + target + ': ' + path.relative(projectRoot, targetDirectory));
}
