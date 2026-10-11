(function (root) {
  'use strict';

  var MAX_HISTORY = 100;

  function isInteger(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  }

  function assertArray(name, values, length) {
    if (!Array.isArray(values) || values.length !== length) {
      throw new Error(name + ' must contain exactly ' + length + ' values.');
    }
  }

  function assertValueRange(name, values, size, allowZero) {
    var minimum = allowZero ? 0 : 1;
    for (var index = 0; index < values.length; index += 1) {
      if (!isInteger(values[index]) || values[index] < minimum || values[index] > size) {
        throw new Error(name + ' contains an invalid value at index ' + index + '.');
      }
    }
  }

  function unitIsComplete(values, size) {
    var seen = [];
    for (var index = 0; index < values.length; index += 1) {
      var value = values[index];
      if (value < 1 || value > size || seen[value]) {
        return false;
      }
      seen[value] = true;
    }
    return true;
  }

  function solutionIsValid(solution, size, boxSize) {
    var row;
    var column;
    var values;

    for (row = 0; row < size; row += 1) {
      values = [];
      for (column = 0; column < size; column += 1) {
        values.push(solution[row * size + column]);
      }
      if (!unitIsComplete(values, size)) {
        return false;
      }
    }

    for (column = 0; column < size; column += 1) {
      values = [];
      for (row = 0; row < size; row += 1) {
        values.push(solution[row * size + column]);
      }
      if (!unitIsComplete(values, size)) {
        return false;
      }
    }

    for (var boxRow = 0; boxRow < size; boxRow += boxSize) {
      for (var boxColumn = 0; boxColumn < size; boxColumn += boxSize) {
        values = [];
        for (row = boxRow; row < boxRow + boxSize; row += 1) {
          for (column = boxColumn; column < boxColumn + boxSize; column += 1) {
            values.push(solution[row * size + column]);
          }
        }
        if (!unitIsComplete(values, size)) {
          return false;
        }
      }
    }

    return true;
  }

  function createPuzzle(options) {
    if (!options || (options.size !== 4 && options.size !== 9)) {
      throw new Error('Puzzle size must be 4 or 9.');
    }

    var size = options.size;
    var length = size * size;
    var boxSize = size === 4 ? 2 : 3;
    assertArray('givens', options.givens, length);
    assertArray('solution', options.solution, length);
    assertValueRange('givens', options.givens, size, true);
    assertValueRange('solution', options.solution, size, false);

    if (!solutionIsValid(options.solution, size, boxSize)) {
      throw new Error('Puzzle solution is not a valid completed Sudoku grid.');
    }

    for (var index = 0; index < length; index += 1) {
      if (options.givens[index] !== 0 && options.givens[index] !== options.solution[index]) {
        throw new Error('Given value does not match solution at index ' + index + '.');
      }
    }

    return {
      id: String(options.id || ('puzzle-' + size)),
      mode: String(options.mode || (size === 4 ? 'simple-4x4' : 'hard-9x9')),
      size: size,
      boxSize: boxSize,
      givens: options.givens.slice(),
      solution: options.solution.slice(),
      difficulty: String(options.difficulty || 'baseline')
    };
  }

  function firstEditableIndex(puzzle) {
    for (var index = 0; index < puzzle.givens.length; index += 1) {
      if (puzzle.givens[index] === 0) {
        return index;
      }
    }
    return null;
  }

  function createGameState(puzzle) {
    return {
      mode: puzzle.mode,
      puzzleId: puzzle.id,
      entries: puzzle.givens.slice(),
      selectedIndex: firstEditableIndex(puzzle),
      history: [],
      status: 'playing',
      moves: 0,
      elapsedSeconds: 0
    };
  }

  function copyState(state) {
    var history = [];
    for (var index = 0; index < state.history.length; index += 1) {
      history.push(state.history[index].slice());
    }
    return {
      mode: state.mode,
      puzzleId: state.puzzleId,
      entries: state.entries.slice(),
      selectedIndex: state.selectedIndex,
      history: history,
      status: state.status,
      moves: state.moves,
      elapsedSeconds: state.elapsedSeconds
    };
  }

  function boardIsRestorable(values, puzzle) {
    if (!Array.isArray(values) || values.length !== puzzle.size * puzzle.size) {
      return false;
    }
    for (var index = 0; index < values.length; index += 1) {
      if (!isInteger(values[index]) || values[index] < 0 || values[index] > puzzle.size) {
        return false;
      }
      if (puzzle.givens[index] !== 0 && values[index] !== puzzle.givens[index]) {
        return false;
      }
    }
    return true;
  }

  function restoreGameState(puzzle, snapshot) {
    if (!snapshot || snapshot.puzzleId !== puzzle.id || snapshot.mode !== puzzle.mode ||
        !boardIsRestorable(snapshot.entries, puzzle) ||
        !(snapshot.selectedIndex === null || validIndex(snapshot.selectedIndex, puzzle)) ||
        !Array.isArray(snapshot.history) || snapshot.history.length > MAX_HISTORY ||
        !isInteger(snapshot.moves) || snapshot.moves < 0 ||
        !isInteger(snapshot.elapsedSeconds) || snapshot.elapsedSeconds < 0) {
      throw new Error('Saved game state is invalid for puzzle ' + puzzle.id + '.');
    }

    var history = [];
    for (var index = 0; index < snapshot.history.length; index += 1) {
      if (!boardIsRestorable(snapshot.history[index], puzzle)) {
        throw new Error('Saved history is invalid for puzzle ' + puzzle.id + '.');
      }
      history.push(snapshot.history[index].slice());
    }

    return {
      mode: puzzle.mode,
      puzzleId: puzzle.id,
      entries: snapshot.entries.slice(),
      selectedIndex: snapshot.selectedIndex,
      history: history,
      status: isComplete(snapshot.entries, puzzle) ? 'completed' : 'playing',
      moves: snapshot.moves,
      elapsedSeconds: snapshot.elapsedSeconds
    };
  }

  function validIndex(index, puzzle) {
    return isInteger(index) && index >= 0 && index < puzzle.size * puzzle.size;
  }

  function getRelatedIndices(index, puzzle) {
    if (!validIndex(index, puzzle)) {
      return [];
    }

    var size = puzzle.size;
    var row = Math.floor(index / size);
    var column = index % size;
    var boxRow = Math.floor(row / puzzle.boxSize) * puzzle.boxSize;
    var boxColumn = Math.floor(column / puzzle.boxSize) * puzzle.boxSize;
    var related = [];

    function add(candidate) {
      if (candidate !== index && related.indexOf(candidate) === -1) {
        related.push(candidate);
      }
    }

    for (var offset = 0; offset < size; offset += 1) {
      add(row * size + offset);
      add(offset * size + column);
    }

    for (var boxRowOffset = 0; boxRowOffset < puzzle.boxSize; boxRowOffset += 1) {
      for (var boxColumnOffset = 0; boxColumnOffset < puzzle.boxSize; boxColumnOffset += 1) {
        add((boxRow + boxRowOffset) * size + boxColumn + boxColumnOffset);
      }
    }

    return related;
  }

  function findConflicts(entries, puzzle) {
    assertArray('entries', entries, puzzle.size * puzzle.size);
    assertValueRange('entries', entries, puzzle.size, true);
    var conflicts = [];
    for (var index = 0; index < entries.length; index += 1) {
      conflicts.push(false);
    }

    for (var current = 0; current < entries.length; current += 1) {
      var value = entries[current];
      if (value === 0) {
        continue;
      }
      var related = getRelatedIndices(current, puzzle);
      for (var peerIndex = 0; peerIndex < related.length; peerIndex += 1) {
        var peer = related[peerIndex];
        if (entries[peer] === value) {
          conflicts[current] = true;
          conflicts[peer] = true;
        }
      }
    }

    return conflicts;
  }

  function isComplete(entries, puzzle) {
    var conflicts = findConflicts(entries, puzzle);
    for (var index = 0; index < entries.length; index += 1) {
      if (entries[index] === 0 || conflicts[index] || entries[index] !== puzzle.solution[index]) {
        return false;
      }
    }
    return true;
  }

  function withBoardChange(state, entries, puzzle) {
    var history = state.history.slice();
    history.push(state.entries.slice());
    if (history.length > MAX_HISTORY) {
      history.shift();
    }
    return {
      mode: state.mode,
      puzzleId: state.puzzleId,
      entries: entries,
      selectedIndex: state.selectedIndex,
      history: history,
      status: isComplete(entries, puzzle) ? 'completed' : 'playing',
      moves: state.moves + 1,
      elapsedSeconds: state.elapsedSeconds
    };
  }

  function reduce(state, action, puzzle) {
    if (!state || !action || !puzzle) {
      throw new Error('State, action and puzzle are required.');
    }

    if (action.type === 'SELECT_CELL') {
      if (!validIndex(action.index, puzzle)) {
        return state;
      }
      var selectedState = copyState(state);
      selectedState.selectedIndex = action.index;
      return selectedState;
    }

    if (action.type === 'PLACE_VALUE') {
      var selectedIndex = state.selectedIndex;
      if (!validIndex(selectedIndex, puzzle) || puzzle.givens[selectedIndex] !== 0) {
        return state;
      }
      if (!isInteger(action.value) || action.value < 1 || action.value > puzzle.size) {
        return state;
      }
      if (state.entries[selectedIndex] === action.value) {
        return state;
      }
      var placedEntries = state.entries.slice();
      placedEntries[selectedIndex] = action.value;
      return withBoardChange(state, placedEntries, puzzle);
    }

    if (action.type === 'CLEAR_CELL') {
      var clearIndex = state.selectedIndex;
      if (!validIndex(clearIndex, puzzle) || puzzle.givens[clearIndex] !== 0 || state.entries[clearIndex] === 0) {
        return state;
      }
      var clearedEntries = state.entries.slice();
      clearedEntries[clearIndex] = 0;
      return withBoardChange(state, clearedEntries, puzzle);
    }

    if (action.type === 'UNDO') {
      if (state.history.length === 0) {
        return state;
      }
      var undoState = copyState(state);
      undoState.entries = undoState.history.pop();
      undoState.status = 'playing';
      undoState.moves = Math.max(0, state.moves - 1);
      return undoState;
    }

    if (action.type === 'NEW_GAME') {
      return createGameState(puzzle);
    }

    return state;
  }

  function getRemainingCounts(entries, puzzle) {
    var counts = [];
    var value;
    for (value = 0; value <= puzzle.size; value += 1) {
      counts.push(puzzle.size);
    }
    counts[0] = 0;
    for (var index = 0; index < entries.length; index += 1) {
      value = entries[index];
      if (value > 0) {
        counts[value] = Math.max(0, counts[value] - 1);
      }
    }
    return counts;
  }

  root.VocalSudokuDomain = {
    MAX_HISTORY: MAX_HISTORY,
    createPuzzle: createPuzzle,
    createGameState: createGameState,
    copyState: copyState,
    restoreGameState: restoreGameState,
    getRelatedIndices: getRelatedIndices,
    findConflicts: findConflicts,
    isComplete: isComplete,
    getRemainingCounts: getRemainingCounts,
    reduce: reduce
  };
}(typeof window !== 'undefined' ? window : this));
