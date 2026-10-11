import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const allowedExtensions = new Set([
  '.html', '.css', '.js', '.json',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.woff', '.woff2', '.m4a'
]);

const forbiddenTextPatterns = [
  ['external URL', /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i],
  ['external CSS URL', /url\(\s*["']?(?:https?:)?\/\//i],
  ['inline event handler', /\son[a-z]+\s*=/i],
  ['javascript URI', /javascript\s*:/i],
  ['iframe', /<iframe\b/i],
  ['object element', /<object\b/i],
  ['base element', /<base\b/i],
  ['module script', /<script\b[^>]*\btype\s*=\s*["']module["']/i],
  ['inline script', /<script(?![^>]*\bsrc\s*=)[^>]*>/i]
];

const forbiddenJavaScriptPatterns = [
  ['network fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\s*\(/],
  ['EventSource', /\bEventSource\s*\(/],
  ['WebRTC', /\bRTCPeerConnection\s*\(/],
  ['Worker', /\b(?:Shared)?Worker\s*\(/],
  ['Service Worker', /navigator\.serviceWorker/],
  ['WebAssembly', /\bWebAssembly\b/],
  ['dynamic eval', /\beval\s*\(/],
  ['dynamic Function', /\bnew\s+Function\s*\(/],
  ['window.open', /\bwindow\.open\s*\(/],
  ['clipboard', /navigator\.clipboard/],
  ['geolocation', /navigator\.geolocation/]
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function collectRelativeReferences(text) {
  const references = [];
  const patterns = [
    /(?:src|href)\s*=\s*["'](\.\/[^"'#?]+)["']/gi,
    /url\(\s*["']?(\.\.?\/[^"')?#]+)["']?\s*\)/gi,
    /\bsrc:\s*["'](\.\/[^"'#?]+)["']/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      references.push(match[1]);
    }
  }
  return references;
}

async function verify() {
  const requestedDirectory = process.argv[2];
  if (!requestedDirectory) {
    throw new Error('Usage: node scripts/verify-build.mjs <dist-directory>');
  }

  const targetDirectory = path.resolve(requestedDirectory);
  const entryPath = path.join(targetDirectory, 'index.html');
  const entryInfo = await stat(entryPath);
  if (!entryInfo.isFile()) {
    throw new Error('index.html is not a file at build root.');
  }

  const files = await walk(targetDirectory);
  const platform = path.basename(targetDirectory);
  const errors = [];
  let totalBytes = 0;
  let htmlCount = 0;

  for (const file of files) {
    const info = await stat(file);
    const extension = path.extname(file).toLowerCase();
    const relativeFile = path.relative(targetDirectory, file);
    totalBytes += info.size;

    if (!allowedExtensions.has(extension)) {
      errors.push('Unsupported release file: ' + relativeFile);
    }
    if (extension === '.html') {
      htmlCount += 1;
    }
    if (file.endsWith('.map')) {
      errors.push('Source map must not be released: ' + relativeFile);
    }

    if (extension === '.html' || extension === '.css' || extension === '.js') {
      const text = await readFile(file, 'utf8');
      if (extension === '.html' && !text.includes('data-platform="' + platform + '"')) {
        errors.push('Missing build platform marker in ' + relativeFile);
      }
      if (platform === 'xhs' && extension === '.html' && /audio-library\.js|audio-file-input|audio-import/.test(text)) {
        errors.push('User audio import remains in XHS: ' + relativeFile);
      }
      for (const [label, pattern] of forbiddenTextPatterns) {
        if (pattern.test(text)) {
          errors.push(label + ' in ' + relativeFile);
        }
      }
      if (extension === '.js') {
        for (const [label, pattern] of forbiddenJavaScriptPatterns) {
          if (pattern.test(text)) {
            errors.push(label + ' in ' + relativeFile);
          }
        }
      }

      for (const reference of collectRelativeReferences(text)) {
        const referencedPath = path.resolve(path.dirname(file), reference);
        const relativeReference = path.relative(targetDirectory, referencedPath);
        if (relativeReference.startsWith('..') || path.isAbsolute(relativeReference)) {
          errors.push('Reference escapes build root: ' + reference + ' in ' + relativeFile);
          continue;
        }
        try {
          await stat(referencedPath);
        } catch {
          errors.push('Missing local resource: ' + reference + ' in ' + relativeFile);
        }
      }
    }
  }

  if (htmlCount !== 1) {
    errors.push('Release must contain exactly one HTML file; found ' + htmlCount + '.');
  }
  if (totalBytes > 10 * 1024 * 1024) {
    errors.push('Release exceeds 10 MiB: ' + totalBytes + ' bytes.');
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error('ERROR: ' + error);
    }
    process.exitCode = 1;
    return;
  }

  const sizeLabel = (totalBytes / 1024 / 1024).toFixed(2) + ' MiB';
  console.log('Verified ' + path.basename(targetDirectory) + ': ' + files.length + ' files, ' + sizeLabel);
  if (totalBytes > 2 * 1024 * 1024) {
    console.warn('WARN: release is above the recommended 2 MiB experience target.');
  }
}

await verify();
