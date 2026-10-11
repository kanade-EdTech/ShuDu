import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const source = await readFile(path.join(projectRoot, 'storage.js'), 'utf8');

function loadModule(localStorage) {
  const context = { window: { localStorage } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.VocalSudokuStorage;
}

function memoryStorage(initialValue) {
  const values = new Map(initialValue ? [['vocal-sudoku-progress-v1', initialValue]] : []);
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
}

test('saves and loads the versioned progress document', () => {
  const module = loadModule(memoryStorage());
  const snapshot = { schemaVersion: 1, currentMode: 'simple', games: { simple: null, hard: null } };
  assert.equal(module.service.save(snapshot).ok, true);
  const loaded = module.service.load();
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.currentMode, 'simple');
});

test('removes corrupt or unsupported saves without throwing', () => {
  const module = loadModule(memoryStorage('{broken json'));
  const result = module.service.load();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'corrupt');
  assert.equal(module.service.load().reason, 'empty');
});

test('reports unavailable and full storage without blocking the caller', () => {
  const storage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() {}
  };
  const service = loadModule(storage).service;
  assert.equal(service.load().reason, 'unavailable');
  assert.equal(service.save({}).reason, 'write-failed');
});
