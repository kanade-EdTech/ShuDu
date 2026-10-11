import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ExchangePuzzleRepository, parseExchangeLine } from './exchange-puzzle-repository.mjs';

export { parseExchangeLine };

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDirectory, '..');
const sourceDirectory = path.join(projectRoot, 'sudoku-exchange-puzzle-bank');
const defaultOutput = path.join(projectRoot, 'puzzle-bank-9x9.js');
const defaultReport = path.join(projectRoot, 'data', 'reports', '9x9-bank-report.json');
const selectionPlan = [
  { bucket: 'easy', label: '简单', count: 1000, seed: 0x66ccff01 },
  { bucket: 'medium', label: '中等', count: 1000, seed: 0x66ccff05 },
  { bucket: 'hard', label: '困难', count: 1000, seed: 0x66ccff09 },
  { bucket: 'diabolical', label: '魔鬼', count: 1000, seed: 0xcc66ff09 }
];
const allDigitsMask = 0x3fe;
const bitToDigit = [];

for (let digit = 1; digit <= 9; digit += 1) {
  bitToDigit[1 << digit] = digit;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return function () {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function solve9x9(givens, maximumSolutions = 2) {
  if (!Array.isArray(givens) || givens.length !== 81) {
    throw new Error('9x9 givens must contain exactly 81 values.');
  }

  const board = givens.slice();
  const rowMasks = new Array(9).fill(0);
  const columnMasks = new Array(9).fill(0);
  const boxMasks = new Array(9).fill(0);
  const emptyIndices = [];
  const solutions = [];

  for (let index = 0; index < board.length; index += 1) {
    const value = board[index];
    if (!Number.isInteger(value) || value < 0 || value > 9) {
      throw new Error('9x9 givens contain an invalid value at index ' + index + '.');
    }
    if (value === 0) {
      emptyIndices.push(index);
      continue;
    }
    const row = Math.floor(index / 9);
    const column = index % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
    const bit = 1 << value;
    if ((rowMasks[row] & bit) || (columnMasks[column] & bit) || (boxMasks[box] & bit)) {
      return [];
    }
    rowMasks[row] |= bit;
    columnMasks[column] |= bit;
    boxMasks[box] |= bit;
  }

  function search(remaining) {
    if (solutions.length >= maximumSolutions) {
      return;
    }
    if (remaining === 0) {
      solutions.push(board.slice());
      return;
    }

    let bestPosition = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let position = 0; position < emptyIndices.length; position += 1) {
      const index = emptyIndices[position];
      if (board[index] !== 0) {
        continue;
      }
      const row = Math.floor(index / 9);
      const column = index % 9;
      const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
      const mask = allDigitsMask & ~(rowMasks[row] | columnMasks[column] | boxMasks[box]);
      let count = 0;
      let candidates = mask;
      while (candidates) {
        candidates &= candidates - 1;
        count += 1;
      }
      if (count === 0) {
        return;
      }
      if (count < bestCount) {
        bestPosition = position;
        bestMask = mask;
        bestCount = count;
        if (count === 1) {
          break;
        }
      }
    }

    const index = emptyIndices[bestPosition];
    const row = Math.floor(index / 9);
    const column = index % 9;
    const box = Math.floor(row / 3) * 3 + Math.floor(column / 3);
    let candidates = bestMask;
    while (candidates && solutions.length < maximumSolutions) {
      const bit = candidates & -candidates;
      const value = bitToDigit[bit];
      candidates &= candidates - 1;
      board[index] = value;
      rowMasks[row] |= bit;
      columnMasks[column] |= bit;
      boxMasks[box] |= bit;
      search(remaining - 1);
      rowMasks[row] &= ~bit;
      columnMasks[column] &= ~bit;
      boxMasks[box] &= ~bit;
      board[index] = 0;
    }
  }

  search(emptyIndices.length);
  return solutions;
}

export async function sampleBucket(repository, bucket, targetCount, seed) {
  const random = createRandom(seed);
  const sample = [];
  let totalRecords = 0;

  for await (const record of repository.stream(bucket)) {
    totalRecords += 1;
    if (sample.length < targetCount) {
      sample.push(record);
    } else {
      const replacement = Math.floor(random() * totalRecords);
      if (replacement < targetCount) {
        sample[replacement] = record;
      }
    }
  }

  if (sample.length !== targetCount) {
    throw new Error(bucket + ': requested ' + targetCount + ' records but found only ' + totalRecords + '.');
  }
  sample.sort(function (left, right) { return left.hash.localeCompare(right.hash); });
  return { sample, totalRecords };
}

export function validateSelection(records) {
  const seen = new Set();
  const puzzles = [];
  const rejected = { duplicate: 0, noSolution: 0, multipleSolutions: 0 };
  let minimumClues = 81;
  let maximumClues = 0;
  let minimumRating = Infinity;
  let maximumRating = -Infinity;

  for (const record of records) {
    const key = record.givens.join('');
    if (seen.has(key)) {
      rejected.duplicate += 1;
      continue;
    }
    seen.add(key);
    const solutions = solve9x9(record.givens, 2);
    if (solutions.length === 0) {
      rejected.noSolution += 1;
      continue;
    }
    if (solutions.length > 1) {
      rejected.multipleSolutions += 1;
      continue;
    }
    const clueCount = record.givens.filter(function (value) { return value !== 0; }).length;
    minimumClues = Math.min(minimumClues, clueCount);
    maximumClues = Math.max(maximumClues, clueCount);
    minimumRating = Math.min(minimumRating, record.rating);
    maximumRating = Math.max(maximumRating, record.rating);
    puzzles.push({
      id: '9x9-' + record.difficulty + '-' + record.hash,
      givens: record.givens,
      solution: solutions[0],
      difficulty: record.difficulty,
      rating: record.rating,
      clueCount
    });
  }

  return {
    puzzles,
    rejected,
    clueRange: puzzles.length ? [minimumClues, maximumClues] : [0, 0],
    ratingRange: puzzles.length ? [minimumRating, maximumRating] : [0, 0]
  };
}

export async function generateBank(options = {}) {
  const outputPath = options.outputPath || defaultOutput;
  const reportPath = options.reportPath || defaultReport;
  const difficulties = [];
  const sources = [];
  const rejected = { duplicate: 0, noSolution: 0, multipleSolutions: 0 };
  let sampledRecords = 0;
  let acceptedUnique = 0;
  let minimumClues = 81;
  let maximumClues = 0;
  let minimumRating = Infinity;
  let maximumRating = -Infinity;
  const repository = new ExchangePuzzleRepository(options.sourceDirectory || sourceDirectory);
  await repository.initialize();

  for (const plan of selectionPlan) {
    const result = await sampleBucket(repository, plan.bucket, plan.count, plan.seed);
    const validation = validateSelection(result.sample);
    if (validation.puzzles.length !== plan.count) {
      throw new Error(plan.bucket + ' selection failed validation: ' + JSON.stringify(validation.rejected));
    }
    difficulties.push({
      id: plan.bucket,
      label: plan.label,
      source: plan.bucket + '.txt',
      seed: '0x' + plan.seed.toString(16),
      encoding: ['hash', 'givens', 'solution', 'rating'],
      puzzles: validation.puzzles.map(function (puzzle) {
        return [
          puzzle.id.slice(('9x9-' + plan.bucket + '-').length),
          puzzle.givens.join(''),
          puzzle.solution.join(''),
          puzzle.rating
        ];
      })
    });
    sources.push({
      file: plan.bucket + '.txt',
      bucket: plan.bucket,
      label: plan.label,
      totalRecords: result.totalRecords,
      selected: plan.count,
      acceptedUnique: validation.puzzles.length,
      seed: '0x' + plan.seed.toString(16),
      rejected: validation.rejected,
      clueRange: validation.clueRange,
      ratingRange: validation.ratingRange
    });
    sampledRecords += plan.count;
    acceptedUnique += validation.puzzles.length;
    rejected.duplicate += validation.rejected.duplicate;
    rejected.noSolution += validation.rejected.noSolution;
    rejected.multipleSolutions += validation.rejected.multipleSolutions;
    minimumClues = Math.min(minimumClues, validation.clueRange[0]);
    maximumClues = Math.max(maximumClues, validation.clueRange[1]);
    minimumRating = Math.min(minimumRating, validation.ratingRange[0]);
    maximumRating = Math.max(maximumRating, validation.ratingRange[1]);
  }

  const bank = {
    schemaVersion: 3,
    source: 'sudoku-exchange-puzzle-bank',
    license: 'Unlicense / public domain',
    size: 9,
    difficulties
  };
  const report = {
    source: bank.source,
    license: bank.license,
    strategy: 'source-file-owned difficulty banks, fixed-seed reservoir sampling, then independent unique-solution validation',
    sources,
    sampledRecords,
    acceptedUnique,
    rejected,
    clueRange: [minimumClues, maximumClues],
    ratingRange: [minimumRating, maximumRating]
  };
  const runtime = '(function (root) {\n  \'use strict\';\n  root.VocalSudokuPuzzleBank9 = ' + JSON.stringify(bank) + ';\n}(typeof window !== \'undefined\' ? window : this));\n';

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(outputPath, runtime, 'utf8');
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return { bank, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = await generateBank();
  console.log('9x9 bank: ' + result.report.acceptedUnique + '/' + result.report.sampledRecords + ' unique puzzles accepted.');
  console.log('Sources: ' + result.report.sources.map(function (source) {
    return source.bucket + ' ' + source.selected + '/' + source.totalRecords;
  }).join(', '));
}
