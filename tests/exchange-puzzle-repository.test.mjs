import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExchangePuzzleRepository } from '../scripts/exchange-puzzle-repository.mjs';
import { solve9x9 } from '../scripts/build-9x9-bank.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.resolve(testDirectory, '..', 'sudoku-exchange-puzzle-bank');

test('repository detects all fixed-record source files and their complete counts', async () => {
  const repository = new ExchangePuzzleRepository(sourceDirectory);
  const metadata = await repository.initialize();
  assert.deepEqual(metadata.map(function (source) { return source.id; }), ['easy', 'medium', 'hard', 'diabolical']);
  assert.deepEqual(metadata.map(function (source) { return source.count; }), [100000, 352643, 321592, 119681]);
  for (const source of metadata) {
    assert.ok(source.recordBytes === 100 || source.recordBytes === 101, source.file);
  }
});

test('repository directly reads the first and last record of every source file', async () => {
  const repository = new ExchangePuzzleRepository(sourceDirectory);
  const metadata = await repository.initialize();
  for (const source of metadata) {
    const first = await repository.read(source.id, 0);
    const last = await repository.read(source.id, source.count - 1);
    assert.equal(first.source, source.file);
    assert.equal(first.sourceIndex, 0);
    assert.equal(last.source, source.file);
    assert.equal(last.sourceIndex, source.count - 1);
    assert.equal(first.givens.length, 81);
    assert.equal(last.givens.length, 81);
    assert.equal(solve9x9(first.givens, 2).length, 1, first.id);
    assert.equal(solve9x9(last.givens, 2).length, 1, last.id);
  }
});

test('repository rejects unknown difficulties and out-of-range indices', async () => {
  const repository = new ExchangePuzzleRepository(sourceDirectory);
  await repository.initialize();
  await assert.rejects(repository.read('easy', -1), RangeError);
  await assert.rejects(repository.read('easy', 100000), RangeError);
  await assert.rejects(repository.read('unknown', 0), /Unknown difficulty/);
});
