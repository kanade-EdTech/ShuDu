import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseExchangeLine, solve9x9 } from '../scripts/build-9x9-bank.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');

async function loadRuntimeBank() {
  const runtime = await readFile(path.join(projectRoot, 'puzzle-bank-9x9.js'), 'utf8');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(runtime, context);
  return context.window.VocalSudokuPuzzleBank9;
}

test('parses all four Sudoku Exchange difficulty records', () => {
  const easy = parseExchangeLine('0000183b305c 050703060007000800000816000000030000005000100730040086906000204840572093000409000  1.2', 1, 'easy');
  const medium = parseExchangeLine('0000847b216e 020900000048000031000063020009407003003080200400105600030570000250000180000006050  2.3', 1, 'medium');
  const hard = parseExchangeLine('00005f662e09 080200400570000100002300000820090005000715000700020041000006700003000018007009050  3.4', 1, 'hard');
  const diabolical = parseExchangeLine('00015097c6c3 083020090000800100029300008000098700070000060006740000300006980002005000010030540  7.2', 1, 'diabolical');
  assert.equal(easy.rating, 1.2);
  assert.equal(medium.rating, 2.3);
  assert.equal(hard.givens.length, 81);
  assert.equal(hard.rating, 3.4);
  assert.equal(diabolical.givens.length, 81);
  assert.equal(diabolical.rating, 7.2);
});

test('generated 9x9 bank preserves four source files as independent difficulty banks', async () => {
  const bank = await loadRuntimeBank();
  assert.equal(bank.schemaVersion, 3);
  assert.equal(bank.size, 9);
  assert.equal(bank.license, 'Unlicense / public domain');
  assert.deepEqual(Array.from(bank.difficulties, function (difficulty) { return difficulty.id; }), ['easy', 'medium', 'hard', 'diabolical']);
  assert.deepEqual(Array.from(bank.difficulties, function (difficulty) { return difficulty.source; }), ['easy.txt', 'medium.txt', 'hard.txt', 'diabolical.txt']);
  assert.deepEqual(Array.from(bank.difficulties, function (difficulty) { return difficulty.puzzles.length; }), [1000, 1000, 1000, 1000]);
  assert.deepEqual(Array.from(bank.difficulties[0].encoding), ['hash', 'givens', 'solution', 'rating']);
});

test('every selected 9x9 puzzle independently resolves to its generated unique solution', async () => {
  const bank = await loadRuntimeBank();
  const ids = new Set();
  for (const difficulty of bank.difficulties) {
    for (const compact of difficulty.puzzles) {
      const id = '9x9-' + difficulty.id + '-' + compact[0];
      const givens = compact[1].split('').map(Number);
      const solution = compact[2].split('').map(Number);
      assert.equal(compact.length, 4, id);
      assert.equal(compact[0].length, 12, id);
      assert.equal(compact[1].length, 81, id);
      assert.equal(compact[2].length, 81, id);
      assert.equal(ids.has(id), false, id);
      ids.add(id);
      const solutions = solve9x9(givens, 2);
      assert.equal(solutions.length, 1, id);
      assert.deepEqual(solutions[0], solution, id);
    }
  }
  assert.equal(ids.size, 4000);
});

test('9x9 build report records full source counts and zero rejects', async () => {
  const report = JSON.parse(await readFile(path.join(projectRoot, 'data', 'reports', '9x9-bank-report.json'), 'utf8'));
  assert.equal(report.sampledRecords, 4000);
  assert.equal(report.acceptedUnique, 4000);
  assert.deepEqual(report.rejected, { duplicate: 0, noSolution: 0, multipleSolutions: 0 });
  assert.deepEqual(report.sources.map(function (source) { return source.totalRecords; }), [100000, 352643, 321592, 119681]);
  assert.deepEqual(report.sources.map(function (source) { return source.selected; }), [1000, 1000, 1000, 1000]);
});
