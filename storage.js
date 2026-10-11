(function (root) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var STORAGE_KEY = 'vocal-sudoku-progress-v1';

  function create(storage) {
    function load() {
      var raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch (error) {
        return { ok: false, data: null, reason: 'unavailable' };
      }
      if (raw === null) {
        return { ok: true, data: null, reason: 'empty' };
      }
      try {
        var data = JSON.parse(raw);
        if (!data || data.schemaVersion !== SCHEMA_VERSION || !data.games ||
            (data.currentMode !== 'simple' && data.currentMode !== 'hard')) {
          throw new Error('Unsupported save schema.');
        }
        return { ok: true, data: data, reason: 'loaded' };
      } catch (error) {
        try {
          storage.removeItem(STORAGE_KEY);
        } catch (removeError) {
          // A broken save must never prevent a new game from starting.
        }
        return { ok: false, data: null, reason: 'corrupt' };
      }
    }

    function save(snapshot) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        return { ok: true, reason: 'saved' };
      } catch (error) {
        return { ok: false, reason: 'write-failed' };
      }
    }

    function clear() {
      try {
        storage.removeItem(STORAGE_KEY);
        return { ok: true };
      } catch (error) {
        return { ok: false };
      }
    }

    return { load: load, save: save, clear: clear };
  }

  var browserStorage;
  try {
    browserStorage = root.localStorage;
  } catch (error) {
    browserStorage = null;
  }

  root.VocalSudokuStorage = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    create: create,
    service: browserStorage ? create(browserStorage) : null
  };
}(typeof window !== 'undefined' ? window : this));
