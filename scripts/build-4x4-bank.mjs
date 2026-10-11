import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const projectRoot = path.resolve(scriptDirectory, '..');
const defaultSource = path.join(projectRoot, 'grid-4_diff-25_placeholder-__enforce-non_unique.jsonl');
const defaultOutput = path.join(projectRoot, 'puzzle-bank-4x4.js');
const defaultReport = path.join(projectRoot, 'data', 'reports', '4x4-bank-report.json');

function isInteger(value) {
  return Number.isInteger(value);
}

function normalizeRecord(record, lineNumber) {
  if (!record || !Array.isArray(record.puzzle) || record.puzzle.length !== 4) {
    throw new Error('Line ' + lineNumber + ': puzzle must contain four rows.');
  }
  if (!record.config || record.config.grid_size !== 4) {
    throw new Error('Line ' + lineNumber + ': config.grid_size must be 4.');
  }

  const placeholder = record.config.placeholder;
  const givens = [];
  for (const row of record.puzzle) {
    if (!Array.isArray(row) || row.length !== 4) {
      throw new Error('Line ' + lineNumber + ': each puzzle row must contain four cells.');
    }
    for (const cell of row) {
      if (cell === placeholder) {
        givens.push(0);
      } else if (isInteger(cell) && cell >= 1 && cell <= 4) {
        givens.push(cell);
      } else {
        throw new Error('Line ' + lineNumber + ': invalid cell value.');
      }
    }
  }

  return {
    givens,
    difficulty: record.config.difficulty,
    declaredUnique: record.config.enforce_unique === true,
    placeholder: String(placeholder)
  };
}

function canPlace(board, index, value) {
  const row = Math.floor(index / 4);
  const column = index % 4;
  for (let offset = 0; offset < 4; offset += 1) {
    if (board[row * 4 + offset] === value || board[offset * 4 + column] === value) {
      return false;
    }
  }
  const boxRow = Math.floor(row / 2) * 2;
  const boxColumn = Math.floor(column / 2) * 2;
  for (let rowOffset = 0; rowOffset < 2; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
      if (board[(boxRow + rowOffset) * 4 + boxColumn + columnOffset] === value) {
        return false;
      }
    }
  }
  return true;
}

function nextCell(board) {
  let bestIndex = -1;
  let bestCandidates = null;
  for (let index = 0; index < board.length; index += 1) {
    if (board[index] !== 0) {
      continue;
    }
    const candidates = [];
    for (let value = 1; value <= 4; value += 1) {
      if (canPlace(board, index, value)) {
        candidates.push(value);
      }
    }
    if (candidates.length === 0) {
      return { index, candidates };
    }
    if (bestCandidates === null || candidates.length < bestCandidates.length) {
      bestIndex = index;
      bestCandidates = candidates;
    }
  }
  return { index: bestIndex, candidates: bestCandidates || [] };
}

export function solve4x4(givens, maximumSolutions = 2) {
  const board = givens.slice();
  const solutions = [];

  function search() {
    if (solutions.length >= maximumSolutions) {
      return;
    }
    const next = nextCell(board);
    if (next.index === -1) {
      solutions.push(board.slice());
      return;
    }
    for (const value of next.candidates) {
      board[next.index] = value;
      search();
      board[next.index] = 0;
      if (solutions.length >= maximumSolutions) {
        return;
      }
    }
  }

  search();
  return solutions;
}

export function parseJsonl(text) {
  const lines = text.split(/\r?\n/).filter(function (line) { return line.trim() !== ''; });
  return lines.map(function (line, index) {
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error('Line ' + (index + 1) + ': invalid JSON.');
    }
    return normalizeRecord(record, index + 1);
  });
}

export function buildBank(records) {
  const seen = new Set();
  const puzzles = [];
  const rejected = { duplicate: 0, noSolution: 0, multipleSolutions: 0 };
  let minimumClues = 16;
  let maximumClues = 0;
  let declaredNonUnique = 0;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const key = record.givens.join('');
    if (seen.has(key)) {
      rejected.duplicate += 1;
      continue;
    }
    seen.add(key);

    const solutions = solve4x4(record.givens, 2);
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
    if (!record.declaredUnique) {
      declaredNonUnique += 1;
    }

    puzzles.push({
      id: '4x4-d' + record.difficulty + '-' + String(index + 1).padStart(3, '0'),
      givens: record.givens,
      solution: solutions[0],
      difficulty: String(record.difficulty),
      clueCount
    });
  }

  if (puzzles.length === 0) {
    throw new Error('No unique 4x4 puzzles were accepted.');
  }

  return {
    bank: {
      schemaVersion: 1,
      source: path.basename(defaultSource),
      size: 4,
      puzzles
    },
    report: {
      source: path.basename(defaultSource),
      totalRecords: records.length,
      acceptedUnique: puzzles.length,
      declaredNonUnique,
      rejected,
      clueRange: [minimumClues, maximumClues]
    }
  };
}

export async function generateBank(options = {}) {
  const sourcePath = options.sourcePath || defaultSource;
  const outputPath = options.outputPath || defaultOutput;
  const reportPath = options.reportPath || defaultReport;
  const text = await readFile(sourcePath, 'utf8');
  const result = buildBank(parseJsonl(text));
  const runtime = '(function (root) {\n  \'use strict\';\n  root.VocalSudokuPuzzleBank4 = ' + JSON.stringify(result.bank) + ';\n}(typeof window !== \'undefined\' ? window : this));\n';

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(outputPath, runtime, 'utf8');
  await writeFile(reportPath, JSON.stringify(result.report, null, 2) + '\n', 'utf8');
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = await generateBank();
  console.log('4x4 bank: ' + result.report.acceptedUnique + '/' + result.report.totalRecords + ' unique puzzles accepted.');
  console.log('Rejected: ' + JSON.stringify(result.report.rejected));
}
