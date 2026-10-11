(function () {
  'use strict';

  var APP_VERSION = '0.9.0-m5';
  var Domain = window.VocalSudokuDomain;
  var SimpleBank = window.VocalSudokuPuzzleBank4;
  var HardBank = window.VocalSudokuPuzzleBank9;
  var StorageModule = window.VocalSudokuStorage;
  var Media = window.VocalSudokuMedia;

  if (!Domain || !SimpleBank || !HardBank || !StorageModule || !Media ||
      !Array.isArray(SimpleBank.puzzles) || SimpleBank.puzzles.length === 0 ||
      !Array.isArray(HardBank.difficulties) || HardBank.difficulties.length === 0) {
    document.documentElement.setAttribute('data-app-error', 'core-data-missing');
    return;
  }

  var hardDifficultyOrder = ['easy', 'medium', 'hard', 'diabolical'];
  var hardBanks = {};
  var hardCount = 0;
  for (var bankIndex = 0; bankIndex < HardBank.difficulties.length; bankIndex += 1) {
    var sourceBank = HardBank.difficulties[bankIndex];
    hardBanks[sourceBank.id] = sourceBank;
    hardCount += Array.isArray(sourceBank.puzzles) ? sourceBank.puzzles.length : 0;
  }
  for (var difficultyIndex = 0; difficultyIndex < hardDifficultyOrder.length; difficultyIndex += 1) {
    var expectedDifficulty = hardDifficultyOrder[difficultyIndex];
    if (!hardBanks[expectedDifficulty] ||
        hardBanks[expectedDifficulty].source !== expectedDifficulty + '.txt' ||
        !Array.isArray(hardBanks[expectedDifficulty].puzzles) ||
        hardBanks[expectedDifficulty].puzzles.length === 0 ||
        !Array.isArray(hardBanks[expectedDifficulty].encoding)) {
      document.documentElement.setAttribute('data-app-error', 'difficulty-data-missing');
      return;
    }
  }

  var currentHardDifficulty = 'hard';
  var bags = { simple: [] };
  var recentIds = { simple: [] };
  for (difficultyIndex = 0; difficultyIndex < hardDifficultyOrder.length; difficultyIndex += 1) {
    var difficultyKey = 'hard-' + hardDifficultyOrder[difficultyIndex];
    bags[difficultyKey] = [];
    recentIds[difficultyKey] = [];
  }
  var RECENT_LIMIT = 20;

  function selectionKey(mode) {
    return mode === 'simple' ? 'simple' : ('hard-' + currentHardDifficulty);
  }

  function recordsForMode(mode) {
    return mode === 'simple' ? SimpleBank.puzzles : hardBanks[currentHardDifficulty].puzzles;
  }

  function recordId(mode, record) {
    return mode === 'simple' ? record.id : ('9x9-' + currentHardDifficulty + '-' + record[0]);
  }

  function digitsToValues(digits) {
    var values = [];
    for (var index = 0; index < digits.length; index += 1) {
      values.push(Number(digits.charAt(index)));
    }
    return values;
  }

  function refillBag(mode) {
    var key = selectionKey(mode);
    var records = recordsForMode(mode);
    var shuffled = [];
    for (var index = 0; index < records.length; index += 1) {
      shuffled.push(index);
    }
    for (var cursor = shuffled.length - 1; cursor > 0; cursor -= 1) {
      var swapIndex = Math.floor(Math.random() * (cursor + 1));
      var temporary = shuffled[cursor];
      shuffled[cursor] = shuffled[swapIndex];
      shuffled[swapIndex] = temporary;
    }

    var recent = recentIds[key];
    var blocked = [];
    var available = [];
    for (var position = 0; position < shuffled.length; position += 1) {
      if (recent.indexOf(recordId(mode, records[shuffled[position]])) === -1) {
        available.push(shuffled[position]);
      } else {
        blocked.push(shuffled[position]);
      }
    }
    bags[key] = blocked.concat(available);
  }

  function nextRecord(mode) {
    var key = selectionKey(mode);
    var records = recordsForMode(mode);
    if (bags[key].length === 0) {
      refillBag(mode);
    }
    var record = records[bags[key].pop()];
    recentIds[key].push(recordId(mode, record));
    if (recentIds[key].length > RECENT_LIMIT) {
      recentIds[key].shift();
    }
    return record;
  }

  function createBankPuzzle(mode) {
    var record = nextRecord(mode);
    return createPuzzleFromRecord(mode, record, currentHardDifficulty);
  }

  function createPuzzleFromRecord(mode, record, hardDifficulty) {
    var size = mode === 'simple' ? SimpleBank.size : HardBank.size;
    var id = mode === 'simple' ? record.id : ('9x9-' + hardDifficulty + '-' + record[0]);
    var givens = mode === 'simple' ? record.givens : digitsToValues(record[1]);
    var solution = mode === 'simple' ? record.solution : digitsToValues(record[2]);
    var difficulty = mode === 'simple' ? record.difficulty : hardDifficulty;
    return Domain.createPuzzle({
      id: id,
      mode: mode === 'simple' ? 'simple-4x4' : 'hard-9x9',
      size: size,
      difficulty: difficulty,
      givens: givens,
      solution: solution
    });
  }

  function findPuzzleById(mode, puzzleId) {
    var index;
    if (mode === 'simple') {
      for (index = 0; index < SimpleBank.puzzles.length; index += 1) {
        if (SimpleBank.puzzles[index].id === puzzleId) {
          return createPuzzleFromRecord('simple', SimpleBank.puzzles[index], null);
        }
      }
      return null;
    }
    for (var difficulty = 0; difficulty < hardDifficultyOrder.length; difficulty += 1) {
      var difficultyName = hardDifficultyOrder[difficulty];
      var records = hardBanks[difficultyName].puzzles;
      for (index = 0; index < records.length; index += 1) {
        if ('9x9-' + difficultyName + '-' + records[index][0] === puzzleId) {
          return createPuzzleFromRecord('hard', records[index], difficultyName);
        }
      }
    }
    return null;
  }

  var puzzles = {
    simple: createBankPuzzle('simple'),
    hard: createBankPuzzle('hard')
  };

  var states = {
    simple: Domain.createGameState(puzzles.simple),
    hard: Domain.createGameState(puzzles.hard)
  };
  var selectedValues = { simple: 1, hard: 1 };
  var currentMode = 'simple';
  var restoredModes = { simple: false, hard: false };
  var storageService = StorageModule.service;
  var storageHealthy = !!storageService;
  var storageReason = storageHealthy ? 'empty' : 'unavailable';
  var modeStartedAt = { simple: Date.now(), hard: Date.now() };

  function restoreSavedProgress() {
    if (!storageService) {
      return;
    }
    var loaded = storageService.load();
    storageReason = loaded.reason;
    if (!loaded.ok) {
      storageHealthy = loaded.reason === 'corrupt';
      return;
    }
    if (!loaded.data) {
      return;
    }
    var data = loaded.data;
    if (data.currentMode === 'simple' || data.currentMode === 'hard') {
      currentMode = data.currentMode;
    }
    if (hardBanks[data.currentHardDifficulty]) {
      currentHardDifficulty = data.currentHardDifficulty;
      puzzles.hard = createBankPuzzle('hard');
      states.hard = Domain.createGameState(puzzles.hard);
    }
    var modes = ['simple', 'hard'];
    for (var modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
      var mode = modes[modeIndex];
      var snapshot = data.games[mode];
      if (!snapshot) {
        continue;
      }
      try {
        var restoredPuzzle = findPuzzleById(mode, snapshot.puzzleId);
        if (!restoredPuzzle) {
          continue;
        }
        var restoredState = Domain.restoreGameState(restoredPuzzle, snapshot);
        if (restoredState.status === 'completed') {
          continue;
        }
        puzzles[mode] = restoredPuzzle;
        states[mode] = restoredState;
        restoredModes[mode] = true;
        if (mode === 'hard') {
          currentHardDifficulty = restoredPuzzle.difficulty;
        }
        recentIds[selectionKey(mode)].push(restoredPuzzle.id);
        bags[selectionKey(mode)] = [];
        var selectedEntry = restoredState.selectedIndex === null ? 0 : restoredState.entries[restoredState.selectedIndex];
        if (selectedEntry > 0) {
          selectedValues[mode] = selectedEntry;
        }
      } catch (error) {
        restoredModes[mode] = false;
      }
    }
  }

  restoreSavedProgress();
  var boardElements = {
    simple: document.querySelector('.board-4'),
    hard: document.querySelector('.board-9')
  };
  var candidateContainers = {
    simple: document.querySelector('.candidate-grid.four'),
    hard: document.querySelector('.candidate-grid.nine')
  };
  var notice = document.querySelector('.save-notice');
  var noticeText = notice ? notice.querySelector('span:last-child') : null;
  var toolButtons = document.querySelectorAll('.tool-button');
  var difficultyButtons = document.querySelectorAll('.difficulty-button');
  var timerElement = document.querySelector('.timer');

  function syncElapsed(mode, force) {
    if (states[mode].status === 'playing' && mode === currentMode && (!document.hidden || force)) {
      var now = Date.now();
      var addedSeconds = Math.floor((now - modeStartedAt[mode]) / 1000);
      if (addedSeconds > 0) {
        states[mode].elapsedSeconds += addedSeconds;
        modeStartedAt[mode] += addedSeconds * 1000;
      }
    }
  }

  function formatElapsed(seconds) {
    var minutes = Math.floor(seconds / 60);
    var remainingSeconds = seconds % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (remainingSeconds < 10 ? '0' : '') + remainingSeconds;
  }

  function renderTimer() {
    if (!timerElement) {
      return;
    }
    syncElapsed(currentMode);
    var formatted = formatElapsed(states[currentMode].elapsedSeconds);
    timerElement.textContent = '◷ ' + formatted;
    timerElement.setAttribute('aria-label', '游戏时间 ' + formatted);
  }

  function saveSnapshot() {
    syncElapsed(currentMode);
    return {
      schemaVersion: StorageModule.SCHEMA_VERSION,
      updatedAt: Date.now(),
      currentMode: currentMode,
      currentHardDifficulty: currentHardDifficulty,
      games: {
        simple: states.simple.status === 'completed' ? null : Domain.copyState(states.simple),
        hard: states.hard.status === 'completed' ? null : Domain.copyState(states.hard)
      }
    };
  }

  function persistProgress() {
    if (!storageService) {
      storageHealthy = false;
      storageReason = 'unavailable';
      return false;
    }
    var result = storageService.save(saveSnapshot());
    storageHealthy = result.ok;
    storageReason = result.reason;
    return result.ok;
  }

  function modePuzzle(mode) {
    return puzzles[mode];
  }

  function modeState(mode) {
    return states[mode];
  }

  function structuralClasses(index, puzzle) {
    var classes = ['cell'];
    var row = Math.floor(index / puzzle.size);
    var column = index % puzzle.size;
    if ((column + 1) % puzzle.boxSize === 0 && column < puzzle.size - 1) {
      classes.push('br');
    }
    if (row > 0 && row % puzzle.boxSize === 0) {
      classes.push('bt');
    }
    return classes;
  }

  function replacePortrait(cellInner, value, mode) {
    while (cellInner.firstChild) {
      cellInner.removeChild(cellInner.firstChild);
    }
    if (value === 0) {
      return;
    }
    var portrait = document.createElement('span');
    portrait.className = 'portrait char-' + value;
    portrait.setAttribute('aria-hidden', 'true');
    Media.icons.applyPortrait(portrait, value, mode);
    cellInner.appendChild(portrait);
  }

  function renderBoard(mode) {
    var puzzle = modePuzzle(mode);
    var state = modeState(mode);
    var board = boardElements[mode];
    var cells = board.querySelectorAll('.cell');
    var conflicts = Domain.findConflicts(state.entries, puzzle);
    var related = state.selectedIndex === null ? [] : Domain.getRelatedIndices(state.selectedIndex, puzzle);

    for (var index = 0; index < cells.length; index += 1) {
      var cell = cells[index];
      var value = state.entries[index];
      var classes = structuralClasses(index, puzzle);
      var isGiven = puzzle.givens[index] !== 0;
      if (isGiven) {
        classes.push('given');
      } else if (value !== 0) {
        classes.push('player');
      }
      if (related.indexOf(index) !== -1) {
        classes.push('related');
      }
      if (state.selectedIndex === index) {
        classes.push('selected');
      }
      if (conflicts[index]) {
        classes.push('conflict');
      }

      cell.className = classes.join(' ');
      cell.setAttribute('data-index', String(index));
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-selected', state.selectedIndex === index ? 'true' : 'false');
      cell.setAttribute('aria-label', value === 0 ? '空格' : ('角色' + value + (isGiven ? '，预置' : '，玩家填入') + (conflicts[index] ? '，存在冲突' : '')));
      replacePortrait(cell.querySelector('.cell-inner'), value, mode);
    }
  }

  function renderCandidates(mode) {
    var puzzle = modePuzzle(mode);
    var state = modeState(mode);
    var candidates = candidateContainers[mode].querySelectorAll('.candidate');
    var remaining = Domain.getRemainingCounts(state.entries, puzzle);

    for (var index = 0; index < candidates.length; index += 1) {
      var value = index + 1;
      var candidate = candidates[index];
      candidate.setAttribute('data-value', String(value));
      candidate.setAttribute('aria-pressed', selectedValues[mode] === value ? 'true' : 'false');
      if (selectedValues[mode] === value) {
        candidate.classList.add('active');
      } else {
        candidate.classList.remove('active');
      }
      if (mode === 'hard') {
        candidate.querySelector('small').textContent = remaining[value] === 0 ? '已用完' : ('剩 ' + remaining[value]);
      }
    }
  }

  function conflictCount(mode) {
    var conflicts = Domain.findConflicts(modeState(mode).entries, modePuzzle(mode));
    var count = 0;
    for (var index = 0; index < conflicts.length; index += 1) {
      if (conflicts[index]) {
        count += 1;
      }
    }
    return count;
  }

  function renderNotice() {
    if (!notice || !noticeText) {
      return;
    }
    var state = modeState(currentMode);
    var conflicts = conflictCount(currentMode);
    notice.classList.remove('warning');
    notice.classList.remove('complete');

    var message;
    if (state.status === 'completed') {
      notice.classList.add('complete');
      message = '演出完成！棋盘已正确填满';
    } else if (conflicts > 0) {
      notice.classList.add('warning');
      message = '检测到 ' + conflicts + ' 个冲突位置，请调整角色';
    } else if (restoredModes[currentMode]) {
      message = '已恢复上次未完成棋局 · 已完成 ' + state.moves + ' 步';
    } else if (state.history.length > 0) {
      message = '已完成 ' + state.moves + ' 步 · 可继续填入或撤销';
    } else {
      message = currentMode === 'simple'
        ? ('4×4 题库 ' + SimpleBank.puzzles.length + ' 题 · 选择空格开始')
        : ('9×9 ' + hardBanks[currentHardDifficulty].label + ' · ' + hardBanks[currentHardDifficulty].source + ' · ' + hardBanks[currentHardDifficulty].puzzles.length + ' 题');
    }
    if (!storageHealthy) {
      notice.classList.add('warning');
      message += ' · 当前进度未保存';
    }
    noticeText.textContent = message;
  }

  function renderDifficultyTabs() {
    for (var index = 0; index < difficultyButtons.length; index += 1) {
      var button = difficultyButtons[index];
      var isActive = button.getAttribute('data-difficulty') === currentHardDifficulty;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      if (isActive) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    }
  }

  function renderTools() {
    var state = modeState(currentMode);
    var puzzle = modePuzzle(currentMode);
    var selected = state.selectedIndex;
    if (toolButtons.length >= 3) {
      toolButtons[0].disabled = state.history.length === 0;
      toolButtons[1].disabled = selected === null || puzzle.givens[selected] !== 0 || state.entries[selected] === 0;
    }
  }

  function render(mode) {
    renderBoard(mode);
    renderCandidates(mode);
    if (mode === 'hard') {
      renderDifficultyTabs();
    }
    if (mode === currentMode) {
      renderTimer();
      renderNotice();
      renderTools();
    }
  }

  function dispatch(mode, action) {
    syncElapsed(mode);
    states[mode] = Domain.reduce(states[mode], action, puzzles[mode]);
    if (action.type !== 'SELECT_CELL') {
      restoredModes[mode] = false;
    }
    persistProgress();
    render(mode);
  }

  function startNewGame(mode) {
    puzzles[mode] = createBankPuzzle(mode);
    states[mode] = Domain.createGameState(puzzles[mode]);
    selectedValues[mode] = 1;
    modeStartedAt[mode] = Date.now();
    restoredModes[mode] = false;
    persistProgress();
    render(mode);
  }

  function selectCell(mode, index) {
    var value = states[mode].entries[index];
    if (value > 0) {
      selectedValues[mode] = value;
    }
    dispatch(mode, { type: 'SELECT_CELL', index: index });
  }

  function placeSelectedValue(mode) {
    dispatch(mode, { type: 'PLACE_VALUE', value: selectedValues[mode] });
  }

  function bindBoard(mode) {
    var cells = boardElements[mode].querySelectorAll('.cell');
    for (var index = 0; index < cells.length; index += 1) {
      (function (cellIndex) {
        cells[cellIndex].addEventListener('click', function () {
          selectCell(mode, cellIndex);
        });
        cells[cellIndex].addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectCell(mode, cellIndex);
          }
        });
      }(index));
    }
  }

  function bindCandidates(mode) {
    var candidates = candidateContainers[mode].querySelectorAll('.candidate');
    for (var index = 0; index < candidates.length; index += 1) {
      (function (value) {
        candidates[value - 1].addEventListener('click', function () {
          selectedValues[mode] = value;
          placeSelectedValue(mode);
        });
      }(index + 1));
    }
  }

  function bindTools() {
    if (toolButtons.length < 3) {
      return;
    }
    toolButtons[0].setAttribute('data-action', 'undo');
    toolButtons[1].setAttribute('data-action', 'clear');
    toolButtons[2].setAttribute('data-action', 'new-game');
    toolButtons[0].addEventListener('click', function () {
      dispatch(currentMode, { type: 'UNDO' });
    });
    toolButtons[1].addEventListener('click', function () {
      dispatch(currentMode, { type: 'CLEAR_CELL' });
    });
    toolButtons[2].addEventListener('click', function () {
      startNewGame(currentMode);
    });
  }

  function bindModes() {
    var simpleRadio = document.getElementById('mode-simple');
    var hardRadio = document.getElementById('mode-hard');
    simpleRadio.addEventListener('change', function () {
      if (simpleRadio.checked) {
        syncElapsed(currentMode);
        currentMode = 'simple';
        modeStartedAt.simple = Date.now();
        persistProgress();
        render(currentMode);
      }
    });
    hardRadio.addEventListener('change', function () {
      if (hardRadio.checked) {
        syncElapsed(currentMode);
        currentMode = 'hard';
        modeStartedAt.hard = Date.now();
        persistProgress();
        render(currentMode);
      }
    });
  }

  function bindDifficulties() {
    for (var index = 0; index < difficultyButtons.length; index += 1) {
      difficultyButtons[index].addEventListener('click', function (event) {
        var difficulty = event.currentTarget.getAttribute('data-difficulty');
        if (!hardBanks[difficulty] || difficulty === currentHardDifficulty) {
          return;
        }
        currentHardDifficulty = difficulty;
        startNewGame('hard');
      });
    }
  }

  function bindKeyboard() {
    document.addEventListener('keydown', function (event) {
      var puzzle = modePuzzle(currentMode);
      var value = Number(event.key);
      if (value >= 1 && value <= puzzle.size) {
        selectedValues[currentMode] = value;
        placeSelectedValue(currentMode);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        dispatch(currentMode, { type: 'CLEAR_CELL' });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch(currentMode, { type: 'UNDO' });
      }
    });
  }

  function bindLifecycle() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        syncElapsed(currentMode, true);
        persistProgress();
        Media.music.pauseForPageHide();
      } else {
        modeStartedAt[currentMode] = Date.now();
        renderTimer();
      }
    });
    window.addEventListener('pagehide', persistProgress);
  }

  function refreshPortraits() {
    var simplePortraits = document.querySelectorAll('.simple-view .portrait');
    var hardPortraits = document.querySelectorAll('.hard-view .portrait');
    var index;
    for (index = 0; index < simplePortraits.length; index += 1) {
      var simpleMatch = /char-(\d+)/.exec(simplePortraits[index].className);
      if (simpleMatch) { Media.icons.applyPortrait(simplePortraits[index], Number(simpleMatch[1]), 'simple'); }
    }
    for (index = 0; index < hardPortraits.length; index += 1) {
      var hardMatch = /char-(\d+)/.exec(hardPortraits[index].className);
      if (hardMatch) { Media.icons.applyPortrait(hardPortraits[index], Number(hardMatch[1]), 'hard'); }
    }
  }

  function bindAvatarManager() {
    var modal = document.querySelector('.avatar-modal');
    var openButton = document.querySelector('.avatar-manager-open');
    var closeButtons = modal.querySelectorAll('.modal-close');
    var tabs = modal.querySelectorAll('[data-icon-mode]');
    var grid = modal.querySelector('.icon-slot-grid');
    var fileInput = modal.querySelector('.icon-file-input');
    var editor = modal.querySelector('.crop-editor');
    var preview = editor.querySelector('img');
    var status = modal.querySelector('.media-status');
    var activeMode = currentMode;
    var activeValue = 1;
    var activeFile = null;
    var previewUrl = null;

    function setStatus(message, warning) {
      status.textContent = message;
      status.className = warning ? 'media-status warning-text' : 'media-status';
    }

    function closeEditor() {
      editor.hidden = true;
      activeFile = null;
      if (previewUrl) { window.URL.revokeObjectURL(previewUrl); previewUrl = null; }
      fileInput.value = '';
    }

    function renderSlots() {
      while (grid.firstChild) { grid.removeChild(grid.firstChild); }
      var count = activeMode === 'simple' ? 4 : 9;
      for (var value = 1; value <= count; value += 1) {
        var slot = document.createElement('div');
        slot.className = 'icon-slot';
        var portrait = document.createElement('span');
        portrait.className = 'portrait char-' + value;
        Media.icons.applyPortrait(portrait, value, activeMode);
        var label = document.createElement('strong');
        label.textContent = value + ' 号角色';
        var buttons = document.createElement('div');
        buttons.className = 'slot-buttons';
        var previous = document.createElement('button');
        previous.type = 'button'; previous.textContent = '←'; previous.disabled = value === 1;
        previous.setAttribute('data-move-from', String(value - 1)); previous.setAttribute('data-move-to', String(value - 2));
        var upload = document.createElement('button');
        upload.type = 'button'; upload.textContent = '上传'; upload.setAttribute('data-upload-value', String(value));
        var next = document.createElement('button');
        next.type = 'button'; next.textContent = '→'; next.disabled = value === count;
        next.setAttribute('data-move-from', String(value - 1)); next.setAttribute('data-move-to', String(value));
        buttons.appendChild(previous); buttons.appendChild(upload); buttons.appendChild(next);
        slot.appendChild(portrait); slot.appendChild(label); slot.appendChild(buttons); grid.appendChild(slot);
      }
    }

    function openModal() {
      activeMode = currentMode;
      for (var index = 0; index < tabs.length; index += 1) {
        tabs[index].classList.toggle('active', tabs[index].getAttribute('data-icon-mode') === activeMode);
      }
      renderSlots();
      setStatus(Media.icons.available() ? '点击槽位上传图片；使用箭头调整角色顺序。' : '当前环境无法持久化图片，将继续使用默认头像。', !Media.icons.available());
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      closeEditor();
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      openButton.focus();
    }

    openButton.addEventListener('click', openModal);
    for (var closeIndex = 0; closeIndex < closeButtons.length; closeIndex += 1) { closeButtons[closeIndex].addEventListener('click', closeModal); }
    for (var tabIndex = 0; tabIndex < tabs.length; tabIndex += 1) {
      tabs[tabIndex].addEventListener('click', function (event) {
        activeMode = event.currentTarget.getAttribute('data-icon-mode');
        for (var index = 0; index < tabs.length; index += 1) { tabs[index].classList.toggle('active', tabs[index] === event.currentTarget); }
        closeEditor(); renderSlots();
      });
    }
    grid.addEventListener('click', function (event) {
      var target = event.target;
      if (target.hasAttribute('data-upload-value')) {
        activeValue = Number(target.getAttribute('data-upload-value'));
        fileInput.click();
      } else if (target.hasAttribute('data-move-from')) {
        try {
          Media.icons.move(activeMode, Number(target.getAttribute('data-move-from')), Number(target.getAttribute('data-move-to')));
          renderSlots(); refreshPortraits();
        } catch (error) { setStatus(error.message, true); }
      }
    });
    fileInput.addEventListener('change', function () {
      activeFile = fileInput.files && fileInput.files[0];
      if (!activeFile) { return; }
      if (activeFile.size > 5 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/i.test(activeFile.type)) {
        setStatus('请选择不超过 5 MiB 的 PNG、JPEG 或 WebP 图片', true);
        closeEditor();
        return;
      }
      if (previewUrl) { window.URL.revokeObjectURL(previewUrl); }
      previewUrl = window.URL.createObjectURL(activeFile);
      editor.querySelector('.crop-zoom').value = '100';
      editor.querySelector('.crop-x').value = '0';
      editor.querySelector('.crop-y').value = '0';
      preview.onload = updateCropPreview;
      preview.src = previewUrl;
      editor.hidden = false;
      setStatus('调整裁切范围后点击“应用裁切”。', false);
    });
    function updateCropPreview() {
      var zoom = Number(editor.querySelector('.crop-zoom').value) / 100;
      var size = preview.parentNode.clientWidth;
      if (!preview.naturalWidth || !size) { return; }
      var scale = Math.max(size / preview.naturalWidth, size / preview.naturalHeight) * zoom;
      var width = preview.naturalWidth * scale;
      var height = preview.naturalHeight * scale;
      preview.style.width = width + 'px';
      preview.style.height = height + 'px';
      preview.style.left = ((size - width) / 2 + Number(editor.querySelector('.crop-x').value) / 100 * (width - size) / 2) + 'px';
      preview.style.top = ((size - height) / 2 + Number(editor.querySelector('.crop-y').value) / 100 * (height - size) / 2) + 'px';
    }
    var cropRanges = editor.querySelectorAll('input[type="range"]');
    for (var rangeIndex = 0; rangeIndex < cropRanges.length; rangeIndex += 1) {
      cropRanges[rangeIndex].addEventListener('input', updateCropPreview);
    }
    editor.querySelector('.crop-cancel').addEventListener('click', closeEditor);
    editor.querySelector('.crop-apply').addEventListener('click', function () {
      if (!activeFile) { return; }
      var crop = {
        zoom: Number(editor.querySelector('.crop-zoom').value) / 100,
        x: Number(editor.querySelector('.crop-x').value) / 100,
        y: Number(editor.querySelector('.crop-y').value) / 100
      };
      setStatus('正在处理并保存头像…', false);
      Media.icons.set(activeMode, activeValue, activeFile, crop).then(function () {
        closeEditor(); renderSlots(); refreshPortraits(); setStatus('头像已保存并应用到当前棋盘。', false);
      }).catch(function (error) { setStatus(error.message || '头像保存失败，已保留原图标。', true); });
    });
    modal.querySelector('.icons-reset').addEventListener('click', function () {
      try {
        Media.icons.reset(activeMode); closeEditor(); renderSlots(); refreshPortraits(); setStatus('本组已恢复默认头像。', false);
      } catch (error) { setStatus(error.message, true); }
    });
  }

  function bindMusic() {
    var card = document.querySelector('.music-card');
    var shortcut = document.querySelector('.music-shortcut');
    var previous = document.querySelector('.music-previous');
    var play = document.querySelector('.music-play');
    var next = document.querySelector('.music-next');
    var volume = document.querySelector('.music-volume');
    var title = card.querySelector('.music-copy strong');
    var subtitle = card.querySelector('.music-copy span');

    function renderMusic(state) {
      title.textContent = state.track.title;
      subtitle.textContent = state.supported ? state.track.subtitle : '当前环境不支持音频播放';
      play.textContent = state.playing ? 'Ⅱ' : '▶';
      play.setAttribute('aria-label', state.playing ? '暂停' : '播放');
      volume.value = String(Math.round(state.volume * 100));
      previous.disabled = !state.supported || state.trackCount <= 1;
      play.disabled = !state.supported;
      next.disabled = !state.supported || state.trackCount <= 1;
    }

    shortcut.addEventListener('click', function () { card.classList.toggle('expanded'); card.scrollIntoView(false); });
    previous.addEventListener('click', Media.music.previous);
    next.addEventListener('click', Media.music.next);
    play.addEventListener('click', function () {
      var state = Media.music.getState();
      if (state.playing) { Media.music.pause(); } else { Media.music.play().catch(function () { subtitle.textContent = '播放失败，请再次点击播放'; }); }
    });
    volume.addEventListener('input', function () { Media.music.setVolume(Number(volume.value) / 100); });
    Media.music.onChange(renderMusic);
    renderMusic(Media.music.getState());
    var Library = window.VocalSudokuAudioLibrary;
    var panel = document.querySelector('.user-music-panel');
    if (Library && Library.allowed && panel) {
      panel.hidden = false;
      var fileInput = panel.querySelector('.audio-file-input');
      var status = panel.querySelector('.audio-status');
      var list = panel.querySelector('.audio-track-list');
      function renderLibrary(state) {
        while (list.firstChild) { list.removeChild(list.firstChild); }
        state.tracks.forEach(function (track) {
          var row = document.createElement('div');
          row.className = 'audio-track-row';
          var button = document.createElement('button');
          button.type = 'button';
          button.textContent = (track.id === state.currentId && state.playing ? 'Ⅱ ' : '▶ ') + track.title;
          button.addEventListener('click', function () {
            if (track.id === state.currentId && state.playing) { Library.pause(); }
            else { Library.play(track.id).catch(function (error) { status.textContent = error.message; }); }
          });
          var remove = document.createElement('button');
          remove.type = 'button'; remove.textContent = '删除';
          remove.setAttribute('aria-label', '删除 ' + track.title);
          remove.addEventListener('click', function () { Library.remove(track.id).catch(function (error) { status.textContent = error.message; }); });
          row.appendChild(button); row.appendChild(remove); list.appendChild(row);
        });
        if (state.message) { status.textContent = state.message; }
      }
      panel.querySelector('.audio-import').addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) { return; }
        status.textContent = '正在验证并保存音乐…';
        Library.importTrack(file).catch(function (error) { status.textContent = error.message; }).then(function () { fileInput.value = ''; });
      });
      Library.onChange(renderLibrary);
      renderLibrary(Library.getState());
    }
  }

  bindBoard('simple');
  bindBoard('hard');
  bindCandidates('simple');
  bindCandidates('hard');
  bindTools();
  bindModes();
  bindDifficulties();
  bindKeyboard();
  bindLifecycle();
  bindAvatarManager();
  bindMusic();
  document.getElementById('mode-simple').checked = currentMode === 'simple';
  document.getElementById('mode-hard').checked = currentMode === 'hard';
  render('simple');
  render('hard');
  window.setInterval(renderTimer, 1000);
  Media.icons.onChange(refreshPortraits);
  Media.ready.then(refreshPortraits);

  document.documentElement.setAttribute('data-app-ready', 'true');
  document.documentElement.setAttribute('data-app-version', APP_VERSION);

  window.VocalSudoku = {
    version: APP_VERSION,
    phase: 'M5',
    platform: window.VocalSudokuPlatform.capabilities(),
    interactive: true,
    getState: function (mode) {
      return Domain.copyState(states[mode || currentMode]);
    },
    getPuzzle: function (mode) {
      var puzzle = puzzles[mode || currentMode];
      return {
        id: puzzle.id,
        mode: puzzle.mode,
        size: puzzle.size,
        boxSize: puzzle.boxSize,
        givens: puzzle.givens.slice(),
        solution: puzzle.solution.slice(),
        difficulty: puzzle.difficulty
      };
    },
    bankInfo: {
      simpleCount: SimpleBank.puzzles.length,
      simpleSource: SimpleBank.source,
      hardCount: hardCount,
      hardSource: HardBank.source,
      hardCounts: {
        easy: hardBanks.easy.puzzles.length,
        medium: hardBanks.medium.puzzles.length,
        hard: hardBanks.hard.puzzles.length,
        diabolical: hardBanks.diabolical.puzzles.length
      },
      hardSources: {
        easy: hardBanks.easy.source,
        medium: hardBanks.medium.source,
        hard: hardBanks.hard.source,
        diabolical: hardBanks.diabolical.source
      },
      recentLimit: RECENT_LIMIT
    },
    getHardDifficulty: function () {
      return currentHardDifficulty;
    },
    flushSave: function () {
      var saved = persistProgress();
      renderNotice();
      return saved;
    },
    getSaveStatus: function () {
      return {
        healthy: storageHealthy,
        reason: storageReason,
        restored: { simple: restoredModes.simple, hard: restoredModes.hard }
      };
    },
    clearSavedProgress: function () {
      return storageService ? storageService.clear().ok : false;
    },
    getMediaStatus: function () {
      return { iconsAvailable: Media.icons.available(), music: Media.music.getState() };
    }
  };
}());
