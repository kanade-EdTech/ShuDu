import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildBank, parseJsonl, solve4x4 } from '../scripts/build-4x4-bank.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const sourcePath = path.join(projectRoot, 'grid-4_diff-25_placeholder-__enforce-non_unique.jsonl');

test('reads all 100 JSONL records and accepts only solver-proven unique puzzles', async () => {
  const text = await readFile(sourcePath, 'utf8');
  const records = parseJsonl(text);
  const result = buildBank(records);

  assert.equal(records.length, 100);
  assert.equal(result.report.acceptedUnique, 100);
  assert.equal(result.report.declaredNonUnique, 100);
  assert.deepEqual(result.report.rejected, {
    duplicate: 0,
    noSolution: 0,
    multipleSolutions: 0
  });
  assert.deepEqual(result.report.clueRange, [12, 14]);
});

test('every accepted puzzle has exactly one solution matching the generated bank', async () => {
  const records = parseJsonl(await readFile(sourcePath, 'utf8'));
  const result = buildBank(records);

  for (const puzzle of result.bank.puzzles) {
    const solutions = solve4x4(puzzle.givens, 2);
    assert.equal(solutions.length, 1, puzzle.id);
    assert.deepEqual(solutions[0], puzzle.solution, puzzle.id);
  }
});

test('generated runtime bank is a classic script with 100 puzzles', async () => {
  const runtime = await readFile(path.join(projectRoot, 'puzzle-bank-4x4.js'), 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(runtime, context);
  const bank = context.window.VocalSudokuPuzzleBank4;

  assert.equal(bank.schemaVersion, 1);
  assert.equal(bank.size, 4);
  assert.equal(bank.puzzles.length, 100);
  assert.match(bank.source, /grid-4_diff-25_placeholder-__enforce-non_unique\.jsonl/);
});
