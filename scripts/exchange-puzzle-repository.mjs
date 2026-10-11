import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

export const difficultyDefinitions = [
  { id: 'easy', label: '简单', file: 'easy.txt' },
  { id: 'medium', label: '中等', file: 'medium.txt' },
  { id: 'hard', label: '困难', file: 'hard.txt' },
  { id: 'diabolical', label: '魔鬼', file: 'diabolical.txt' }
];

function definitionFor(difficulty) {
  for (const definition of difficultyDefinitions) {
    if (definition.id === difficulty) {
      return definition;
    }
  }
  throw new Error('Unknown difficulty: ' + difficulty + '.');
}

export function parseExchangeLine(line, lineNumber, difficulty) {
  definitionFor(difficulty);
  const fields = line.trim().split(/\s+/);
  if (fields.length !== 3) {
    throw new Error(difficulty + ' line ' + lineNumber + ': expected hash, digits and rating.');
  }
  const hash = fields[0];
  const digits = fields[1];
  const rating = Number(fields[2]);
  if (!/^[0-9a-f]{12}$/.test(hash)) {
    throw new Error(difficulty + ' line ' + lineNumber + ': invalid 12-character hash.');
  }
  if (!/^[0-9]{81}$/.test(digits)) {
    throw new Error(difficulty + ' line ' + lineNumber + ': puzzle must contain 81 digits.');
  }
  if (!Number.isFinite(rating)) {
    throw new Error(difficulty + ' line ' + lineNumber + ': invalid difficulty rating.');
  }
  return {
    id: '9x9-' + difficulty + '-' + hash,
    hash,
    digits,
    givens: digits.split('').map(Number),
    rating,
    difficulty,
    source: definitionFor(difficulty).file,
    sourceIndex: lineNumber - 1
  };
}

export class ExchangePuzzleRepository {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.sources = {};
    this.ready = false;
  }

  async initialize() {
    const sources = {};
    for (const definition of difficultyDefinitions) {
      const filePath = path.join(this.directory, definition.file);
      const info = await stat(filePath);
      const handle = await open(filePath, 'r');
      const probe = Buffer.alloc(Math.min(256, info.size));
      try {
        await handle.read(probe, 0, probe.length, 0);
      } finally {
        await handle.close();
      }
      const newlineIndex = probe.indexOf(10);
      if (newlineIndex < 0) {
        throw new Error(definition.file + ': cannot detect fixed record length.');
      }
      const recordBytes = newlineIndex + 1;
      if (recordBytes !== 100 && recordBytes !== 101) {
        throw new Error(definition.file + ': expected 100-byte LF or 101-byte CRLF records.');
      }
      if (info.size % recordBytes !== 0) {
        throw new Error(definition.file + ': file size is not divisible by its fixed record length.');
      }
      sources[definition.id] = {
        id: definition.id,
        label: definition.label,
        file: definition.file,
        filePath,
        bytes: info.size,
        recordBytes,
        count: info.size / recordBytes
      };
    }
    this.sources = sources;
    this.ready = true;
    return this.getMetadata();
  }

  assertReady() {
    if (!this.ready) {
      throw new Error('ExchangePuzzleRepository.initialize() must be called first.');
    }
  }

  getMetadata() {
    this.assertReady();
    return difficultyDefinitions.map((definition) => {
      const source = this.sources[definition.id];
      return {
        id: source.id,
        label: source.label,
        file: source.file,
        bytes: source.bytes,
        recordBytes: source.recordBytes,
        count: source.count
      };
    });
  }

  async read(difficulty, zeroBasedIndex) {
    this.assertReady();
    const source = this.sources[definitionFor(difficulty).id];
    if (!Number.isInteger(zeroBasedIndex) || zeroBasedIndex < 0 || zeroBasedIndex >= source.count) {
      throw new RangeError(difficulty + ' index must be between 0 and ' + (source.count - 1) + '.');
    }
    const buffer = Buffer.alloc(source.recordBytes);
    const handle = await open(source.filePath, 'r');
    let bytesRead;
    try {
      const result = await handle.read(buffer, 0, source.recordBytes, zeroBasedIndex * source.recordBytes);
      bytesRead = result.bytesRead;
    } finally {
      await handle.close();
    }
    if (bytesRead !== source.recordBytes) {
      throw new Error(source.file + ': incomplete record at index ' + zeroBasedIndex + '.');
    }
    return parseExchangeLine(buffer.toString('utf8').trim(), zeroBasedIndex + 1, difficulty);
  }

  async *stream(difficulty) {
    this.assertReady();
    const source = this.sources[definitionFor(difficulty).id];
    const input = createReadStream(source.filePath, { encoding: 'utf8' });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    let lineNumber = 0;
    for await (const line of lines) {
      if (line.trim() === '') {
        continue;
      }
      lineNumber += 1;
      yield parseExchangeLine(line, lineNumber, difficulty);
    }
    if (lineNumber !== source.count) {
      throw new Error(source.file + ': streamed ' + lineNumber + ' records but metadata reports ' + source.count + '.');
    }
  }
}
