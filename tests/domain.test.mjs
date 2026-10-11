import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const source = await readFile(path.join(projectRoot, 'domain.js'), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const Domain = context.window.VocalSudokuDomain;

const simpleSolution = [
  1, 2, 3, 4,
  3, 4, 1, 2,
  2, 1, 4, 3,
  4, 3, 2, 1
];

function simplePuzzle(givens) {
  return Domain.createPuzzle({
    id: 'test-simple',
    mode: 'simple-4x4',
    size: 4,
    givens: givens || [1, 0, 3, 4, 3, 4, 0, 2, 0, 1, 4, 0, 4, 3, 2, 0],
    solution: simpleSolution
  });
}

test('creates validated 4x4 puzzle and rejects invalid givens', () => {
  const puzzle = simplePuzzle();
  assert.equal(puzzle.size, 4);
  assert.equal(puzzle.boxSize, 2);
  assert.throws(() => simplePuzzle([2, 0, 3, 4, 3, 4, 0, 2, 0, 1, 4, 0, 4, 3, 2, 0]));
});

test('finds row, column and box conflicts without rejecting the move', () => {
  const puzzle = simplePuzzle(new Array(16).fill(0));
  const entries = new Array(16).fill(0);
  entries[0] = 1;
  entries[1] = 1;
  entries[4] = 1;
  const conflicts = Array.from(Domain.findConflicts(entries, puzzle));
  assert.equal(conflicts[0], true);
  assert.equal(conflicts[1], true);
  assert.equal(conflicts[4], true);
  assert.equal(conflicts[15], false);
});

test('selects, places, clears and undoes while protecting givens', () => {
  const puzzle = simplePuzzle();
  let state = Domain.createGameState(puzzle);
  assert.equal(state.selectedIndex, 1);

  state = Domain.reduce(state, { type: 'PLACE_VALUE', value: 2 }, puzzle);
  assert.equal(state.entries[1], 2);
  assert.equal(state.history.length, 1);

  state = Domain.reduce(state, { type: 'CLEAR_CELL' }, puzzle);
  assert.equal(state.entries[1], 0);
  assert.equal(state.history.length, 2);

  state = Domain.reduce(state, { type: 'UNDO' }, puzzle);
  assert.equal(state.entries[1], 2);
  assert.equal(state.history.length, 1);

  state = Domain.reduce(state, { type: 'SELECT_CELL', index: 0 }, puzzle);
  const unchanged = Domain.reduce(state, { type: 'PLACE_VALUE', value: 4 }, puzzle);
  assert.equal(unchanged.entries[0], 1);
  assert.equal(unchanged.history.length, 1);
});

test('marks completion only after the exact valid solution is present', () => {
  const puzzle = simplePuzzle();
  let state = Domain.createGameState(puzzle);
  for (let index = 0; index < puzzle.solution.length; index += 1) {
    if (puzzle.givens[index] === 0) {
      state = Domain.reduce(state, { type: 'SELECT_CELL', index }, puzzle);
      state = Domain.reduce(state, { type: 'PLACE_VALUE', value: puzzle.solution[index] }, puzzle);
    }
  }
  assert.equal(Domain.isComplete(state.entries, puzzle), true);
  assert.equal(state.status, 'completed');

  state = Domain.reduce(state, { type: 'UNDO' }, puzzle);
  assert.equal(state.status, 'playing');
  assert.equal(Domain.isComplete(state.entries, puzzle), false);
});

test('returns unique related cells for 4x4 and 9x9 boards', () => {
  const puzzle4 = simplePuzzle(new Array(16).fill(0));
  assert.equal(Domain.getRelatedIndices(5, puzzle4).length, 7);

  const solution9 = [
    5, 3, 4, 6, 7, 8, 9, 1, 2,
    6, 7, 2, 1, 9, 5, 3, 4, 8,
    1, 9, 8, 3, 4, 2, 5, 6, 7,
    8, 5, 9, 7, 6, 1, 4, 2, 3,
    4, 2, 6, 8, 5, 3, 7, 9, 1,
    7, 1, 3, 9, 2, 4, 8, 5, 6,
    9, 6, 1, 5, 3, 7, 2, 8, 4,
    2, 8, 7, 4, 1, 9, 6, 3, 5,
    3, 4, 5, 2, 8, 6, 1, 7, 9
  ];
  const puzzle9 = Domain.createPuzzle({
    id: 'test-hard',
    mode: 'hard-9x9',
    size: 9,
    givens: new Array(81).fill(0),
    solution: solution9
  });
  assert.equal(Domain.getRelatedIndices(40, puzzle9).length, 20);
});

test('caps undo history at 100 board changes', () => {
  const puzzle = simplePuzzle(new Array(16).fill(0));
  let state = Domain.createGameState(puzzle);
  for (let step = 0; step < 105; step += 1) {
    state = Domain.reduce(state, { type: 'PLACE_VALUE', value: step % 2 === 0 ? 1 : 2 }, puzzle);
  }
  assert.equal(state.history.length, Domain.MAX_HISTORY);
});

test('restores a validated game state and recomputes its status', () => {
  const puzzle = simplePuzzle();
  let state = Domain.createGameState(puzzle);
  state = Domain.reduce(state, { type: 'PLACE_VALUE', value: 2 }, puzzle);
  const restored = Domain.restoreGameState(puzzle, JSON.parse(JSON.stringify(state)));
  assert.equal(restored.entries[1], 2);
  assert.equal(restored.history.length, 1);
  assert.equal(restored.status, 'playing');
  assert.equal(restored.elapsedSeconds, 0);
});

test('rejects saved states that alter givens, mismatch puzzles or contain invalid history', () => {
  const puzzle = simplePuzzle();
  const state = Domain.createGameState(puzzle);
  const changedGiven = JSON.parse(JSON.stringify(state));
  changedGiven.entries[0] = 2;
  assert.throws(() => Domain.restoreGameState(puzzle, changedGiven));

  const wrongPuzzle = JSON.parse(JSON.stringify(state));
  wrongPuzzle.puzzleId = 'missing';
  assert.throws(() => Domain.restoreGameState(puzzle, wrongPuzzle));

  const badHistory = JSON.parse(JSON.stringify(state));
  badHistory.history = [[1, 2]];
  assert.throws(() => Domain.restoreGameState(puzzle, badHistory));
});
