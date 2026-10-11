import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import path from 'node:path';

const port = Number(process.argv[2] || 9223);
const pageUrl = process.argv[3];
const screenshotPath = process.argv[4];

if (!pageUrl || !screenshotPath) {
  throw new Error('Usage: node scripts/browser-smoke.mjs <port> <page-url> <screenshot-path>');
}

async function waitForDebugger() {
  var lastError;
  for (var attempt = 0; attempt < 30; attempt += 1) {
    try {
      var response = await fetch('http://127.0.0.1:' + port + '/json/list');
      var targets = await response.json();
      var target = targets.find(function (candidate) {
        return candidate.type === 'page' && candidate.url === pageUrl && candidate.webSocketDebuggerUrl;
      });
      if (target) {
        return target.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
  }
  throw lastError || new Error('Chrome debugger did not become ready.');
}

const debuggerUrl = await waitForDebugger();
const socket = new WebSocket(debuggerUrl);
const pending = new Map();
const failedResources = [];
const runtimeErrors = [];
let commandId = 0;

await new Promise(function (resolve, reject) {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

socket.addEventListener('message', function (event) {
  var message = JSON.parse(event.data);
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400 && !message.params.response.url.endsWith('/favicon.ico')) {
    failedResources.push(message.params.response.url);
  }
  if (message.method === 'Runtime.exceptionThrown') { runtimeErrors.push(message.params.exceptionDetails.text); }
  if (!message.id || !pending.has(message.id)) {
    return;
  }
  var handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) {
    handlers.reject(new Error(message.error.message));
  } else {
    handlers.resolve(message.result);
  }
});

function send(method, params) {
  commandId += 1;
  return new Promise(function (resolve, reject) {
    pending.set(commandId, { resolve: resolve, reject: reject });
    socket.send(JSON.stringify({ id: commandId, method: method, params: params || {} }));
  });
}

async function evaluate(expression) {
  var response = await send('Runtime.evaluate', {
    expression: expression,
    returnByValue: true,
    userGesture: true,
    awaitPromise: true
  });
  if (response.exceptionDetails) {
    var exception = response.exceptionDetails.exception;
    var detail = exception && (exception.description || exception.value);
    throw new Error(detail || response.exceptionDetails.text || 'Browser evaluation failed.');
  }
  return response.result.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('DOM.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 500,
  height: 900,
  deviceScaleFactor: 1,
  mobile: true
});
await send('Page.navigate', { url: pageUrl });

var appReady = false;
for (var readyAttempt = 0; readyAttempt < 30; readyAttempt += 1) {
  var readyValue = await evaluate('document.documentElement.getAttribute("data-app-ready")');
  if (readyValue === 'true') {
    appReady = true;
    break;
  }
  await new Promise(function (resolve) { setTimeout(resolve, 100); });
}
if (!appReady) {
  var diagnostics = await evaluate(`JSON.stringify({
    readyState: document.readyState,
    appError: document.documentElement.getAttribute('data-app-error'),
    scripts: Array.prototype.map.call(document.scripts, function (script) { return script.getAttribute('src'); })
  })`);
  throw new Error('Application did not become ready in Chrome: ' + diagnostics);
}

await evaluate(`(function () {
  var radio = document.getElementById('mode-simple');
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('.avatar-manager-open').click();
  document.querySelector('[data-icon-mode="simple"]').click();
}())`);
const documentTree = await send('DOM.getDocument', { depth: -1, pierce: true });
const inputNode = await send('DOM.querySelector', { nodeId: documentTree.root.nodeId, selector: '.icon-file-input' });
await send('DOM.setFileInputFiles', {
  nodeId: inputNode.nodeId,
  files: [path.resolve(process.cwd(), '公式服头像', '2乐正绫.png')]
});
var cropReady = false;
for (var cropAttempt = 0; cropAttempt < 30; cropAttempt += 1) {
  if (await evaluate('!document.querySelector(".crop-editor").hidden')) { cropReady = true; break; }
  await new Promise(function (resolve) { setTimeout(resolve, 100); });
}
if (!cropReady) { throw new Error('Avatar crop editor did not open after file selection.'); }
await evaluate('document.querySelector(".crop-apply").click()');
var iconApplied = false;
for (var iconAttempt = 0; iconAttempt < 40; iconAttempt += 1) {
  if (await evaluate('document.querySelector(".icon-slot .portrait").getAttribute("data-icon-source") === "user"')) { iconApplied = true; break; }
  await new Promise(function (resolve) { setTimeout(resolve, 100); });
}
const iconUploadResult = await evaluate(`(function () {
  var boardUsesUserIcon = false;
  var portraits = document.querySelectorAll('.simple-view .char-1');
  for (var index = 0; index < portraits.length; index += 1) {
    if (portraits[index].getAttribute('data-icon-source') === 'user') { boardUsesUserIcon = true; }
  }
  document.querySelector('.icons-reset').click();
  var resetToBuiltin = document.querySelector('.icon-slot .portrait').getAttribute('data-icon-source') === 'builtin';
  document.querySelector('.modal-close').click();
  return { iconApplied: ${iconApplied}, boardUsesUserIcon: boardUsesUserIcon, resetToBuiltin: resetToBuiltin };
}())`);

const result = await evaluate(`(async function () {
  function click(selector, index) {
    var elements = document.querySelectorAll(selector);
    elements[index || 0].click();
  }

  var initialPuzzle = window.VocalSudoku.getPuzzle('simple');
  click('.tool-button', 2);
  var testPuzzle = window.VocalSudoku.getPuzzle('simple');
  var initial = window.VocalSudoku.getState('simple');
  var targetIndex = -1;
  var conflictValue = 0;
  for (var candidateIndex = 0; candidateIndex < testPuzzle.givens.length && targetIndex < 0; candidateIndex += 1) {
    if (testPuzzle.givens[candidateIndex] !== 0) {
      continue;
    }
    var peers = window.VocalSudokuDomain.getRelatedIndices(candidateIndex, testPuzzle);
    for (var peerIndex = 0; peerIndex < peers.length; peerIndex += 1) {
      if (initial.entries[peers[peerIndex]] > 0) {
        targetIndex = candidateIndex;
        conflictValue = initial.entries[peers[peerIndex]];
        break;
      }
    }
  }

  click('.board-4 .cell', targetIndex);
  click('.candidate-grid.four .candidate', testPuzzle.solution[targetIndex] - 1);
  var afterPlace = window.VocalSudoku.getState('simple');

  click('.candidate-grid.four .candidate', conflictValue - 1);
  var conflictVisible = document.querySelectorAll('.board-4 .cell.conflict').length >= 2;
  var conflictNotice = document.querySelector('.save-notice').classList.contains('warning');

  click('.tool-button', 1);
  var afterClear = window.VocalSudoku.getState('simple');
  click('.tool-button', 0);
  var afterUndo = window.VocalSudoku.getState('simple');

  click('.tool-button', 2);
  var completionPuzzle = window.VocalSudoku.getPuzzle('simple');
  for (var index = 0; index < completionPuzzle.solution.length; index += 1) {
    if (completionPuzzle.givens[index] === 0) {
      click('.board-4 .cell', index);
      click('.candidate-grid.four .candidate', completionPuzzle.solution[index] - 1);
    }
  }
  var completed = window.VocalSudoku.getState('simple');
  var completionNotice = document.querySelector('.save-notice').classList.contains('complete');

  var initialHardPuzzle = window.VocalSudoku.getPuzzle('hard');
  var hardRadio = document.getElementById('mode-hard');
  hardRadio.checked = true;
  hardRadio.dispatchEvent(new Event('change', { bubbles: true }));
  click('.tool-button', 2);
  var nextHardPuzzle = window.VocalSudoku.getPuzzle('hard');
  var hardState = window.VocalSudoku.getState('hard');
  var switchedToHard = getComputedStyle(document.querySelector('.hard-view')).display !== 'none';
  var difficultyNames = ['easy', 'medium', 'hard', 'diabolical'];
  var difficultySelectionWorks = true;
  for (var difficultyIndex = 0; difficultyIndex < difficultyNames.length; difficultyIndex += 1) {
    click('.difficulty-button', difficultyIndex);
    var selectedDifficulty = difficultyNames[difficultyIndex];
    var activeButton = document.querySelector('.difficulty-button.active');
    if (window.VocalSudoku.getHardDifficulty() !== selectedDifficulty ||
        window.VocalSudoku.getPuzzle('hard').difficulty !== selectedDifficulty ||
        !activeButton || activeButton.getAttribute('data-difficulty') !== selectedDifficulty) {
      difficultySelectionWorks = false;
    }
  }

  await new Promise(function (resolve) { setTimeout(resolve, 1100); });

  var persistedPuzzle = window.VocalSudoku.getPuzzle('hard');
  var persistedBefore = window.VocalSudoku.getState('hard');
  var persistedIndex = persistedBefore.selectedIndex;
  click('.candidate-grid.nine .candidate', persistedPuzzle.solution[persistedIndex] - 1);
  var persistedAfter = window.VocalSudoku.getState('hard');

  click('.avatar-manager-open', 0);
  var avatarModalOpened = !document.querySelector('.avatar-modal').hidden;
  click('[data-icon-mode]', 0);
  var simpleIconSlots = document.querySelectorAll('.icon-slot').length;
  click('[data-icon-mode]', 1);
  var hardIconSlots = document.querySelectorAll('.icon-slot').length;
  click('.modal-close', 0);
  var avatarModalClosed = document.querySelector('.avatar-modal').hidden;

  var musicSupported = window.VocalSudoku.getMediaStatus().music.supported;
  click('.music-play', 0);
  await new Promise(function (resolve) { setTimeout(resolve, 80); });
  var musicStarted = window.VocalSudoku.getMediaStatus().music.playing;
  var firstTrack = window.VocalSudoku.getMediaStatus().music.track.id;
  click('.music-next', 0);
  var singleTrackNavigationDisabled = window.VocalSudoku.getMediaStatus().music.track.id === firstTrack &&
    window.VocalSudoku.getMediaStatus().music.trackCount === 1 &&
    document.querySelector('.music-next').disabled && document.querySelector('.music-previous').disabled;
  click('.music-play', 0);
  var musicPaused = !window.VocalSudoku.getMediaStatus().music.playing;

  return {
    appVersion: window.VocalSudoku.version,
    simpleBankCount: window.VocalSudoku.bankInfo.simpleCount,
    hardBankCount: window.VocalSudoku.bankInfo.hardCount,
    hardDifficultyCounts: JSON.stringify(window.VocalSudoku.bankInfo.hardCounts),
    hardDifficultySources: JSON.stringify(window.VocalSudoku.bankInfo.hardSources),
    newPuzzleChanged: initialPuzzle.id !== testPuzzle.id,
    validTarget: targetIndex >= 0,
    placedCorrectly: afterPlace.entries[targetIndex] === testPuzzle.solution[targetIndex],
    conflictVisible: conflictVisible,
    conflictNotice: conflictNotice,
    clearedValue: afterClear.entries[targetIndex],
    undoRestoredConflict: afterUndo.entries[targetIndex] === conflictValue,
    completedStatus: completed.status,
    completionNotice: completionNotice,
    hardPuzzleChanged: initialHardPuzzle.id !== nextHardPuzzle.id,
    hardSelectedValid: hardState.selectedIndex >= 0 && nextHardPuzzle.givens[hardState.selectedIndex] === 0,
    difficultySelectionWorks: difficultySelectionWorks,
    switchedToHard: switchedToHard,
    saveHealthy: window.VocalSudoku.getSaveStatus().healthy,
    persistedPuzzleId: persistedPuzzle.id,
    persistedIndex: persistedIndex,
    persistedValue: persistedAfter.entries[persistedIndex],
    persistedHistoryLength: persistedAfter.history.length,
    persistedElapsedSeconds: persistedAfter.elapsedSeconds,
    avatarModalOpened: avatarModalOpened,
    simpleIconSlots: simpleIconSlots,
    hardIconSlots: hardIconSlots,
    avatarModalClosed: avatarModalClosed,
    musicSupported: musicSupported,
    musicStarted: musicStarted,
    singleTrackNavigationDisabled: singleTrackNavigationDisabled,
    musicPaused: musicPaused
  };
}())`);
result.iconApplied = iconUploadResult.iconApplied;
result.boardUsesUserIcon = iconUploadResult.boardUsesUserIcon;
result.resetToBuiltin = iconUploadResult.resetToBuiltin;

const expected = {
  appVersion: '0.9.0-m5',
  simpleBankCount: 100,
  hardBankCount: 4000,
  hardDifficultyCounts: '{"easy":1000,"medium":1000,"hard":1000,"diabolical":1000}',
  hardDifficultySources: '{"easy":"easy.txt","medium":"medium.txt","hard":"hard.txt","diabolical":"diabolical.txt"}',
  newPuzzleChanged: true,
  validTarget: true,
  placedCorrectly: true,
  conflictVisible: true,
  conflictNotice: true,
  clearedValue: 0,
  undoRestoredConflict: true,
  completedStatus: 'completed',
  completionNotice: true,
  hardPuzzleChanged: true,
  hardSelectedValid: true,
  difficultySelectionWorks: true,
  switchedToHard: true,
  saveHealthy: true,
  avatarModalOpened: true,
  simpleIconSlots: 4,
  hardIconSlots: 9,
  avatarModalClosed: true,
  musicSupported: true,
  musicStarted: true,
  singleTrackNavigationDisabled: true,
  musicPaused: true,
  iconApplied: true,
  boardUsesUserIcon: true,
  resetToBuiltin: true
};

for (const key of Object.keys(expected)) {
  if (result[key] !== expected[key]) {
    throw new Error(key + ' expected ' + expected[key] + ' but received ' + result[key]);
  }
}
if (result.persistedElapsedSeconds < 1) {
  throw new Error('Timer did not advance before save.');
}

const mediaBeforeReload = await evaluate(`(async function () {
  await window.VocalSudokuMedia.ready;
  var canvas = document.createElement('canvas');
  canvas.width = 24; canvas.height = 24;
  canvas.getContext('2d').fillRect(0, 0, 24, 24);
  var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
  await window.VocalSudokuMedia.icons.set('simple', 1, new File([blob], 'test.png', { type: 'image/png' }), { zoom: 1, x: 0, y: 0 });
  var library = window.VocalSudokuAudioLibrary;
  if (!library) { return { audioAllowed: false }; }
  var buffer = new ArrayBuffer(44 + 8000);
  var view = new DataView(buffer);
  function text(offset, value) { for (var index = 0; index < value.length; index += 1) { view.setUint8(offset + index, value.charCodeAt(index)); } }
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, 8000, true);
  await library.importTrack(new File([buffer], 'test-loop.wav', { type: 'audio/wav' }));
  var id = library.getState().tracks[0].id;
  await library.play(id);
  var playing = library.getState().playing;
  library.pause();
  window.VocalSudokuMedia.music.setVolume(0.27);
  return { audioAllowed: true, id: id, playing: playing };
}())`);
if (mediaBeforeReload.audioAllowed && !mediaBeforeReload.playing) { throw new Error('Imported audio did not play.'); }

await send('Page.reload', { ignoreCache: true });
await new Promise(function (resolve) { setTimeout(resolve, 300); });
var restoredReady = false;
for (var reloadAttempt = 0; reloadAttempt < 30; reloadAttempt += 1) {
  if (await evaluate('document.readyState === "complete" && document.documentElement.getAttribute("data-app-ready") === "true"')) {
    restoredReady = true;
    break;
  }
  await new Promise(function (resolve) { setTimeout(resolve, 100); });
}
if (!restoredReady) {
  throw new Error('Application did not become ready after reload.');
}
const mediaRestored = await evaluate(`(async function () {
  await window.VocalSudokuMedia.ready;
  var element = document.querySelector('.simple-view .char-1');
  var iconRestored = element && element.getAttribute('data-icon-source') === 'user';
  var library = window.VocalSudokuAudioLibrary;
  var audioRestored = !library || library.getState().tracks.length === 1;
  var audioRemoved = true;
  if (library) {
    await library.remove(library.getState().tracks[0].id);
    audioRemoved = library.getState().tracks.length === 0;
  }
  return { iconRestored: iconRestored, audioRestored: audioRestored, audioRemoved: audioRemoved,
    volumeRestored: window.VocalSudokuMedia.music.getState().volume === 0.27 };
}())`);
if (!mediaRestored.iconRestored || !mediaRestored.audioRestored || !mediaRestored.audioRemoved ||
    (mediaBeforeReload.audioAllowed && !mediaRestored.volumeRestored)) {
  throw new Error('Media restore failed: ' + JSON.stringify(mediaRestored));
}
const restored = await evaluate(`(function () {
  var state = window.VocalSudoku.getState('hard');
  return {
    modeChecked: document.getElementById('mode-hard').checked,
    difficulty: window.VocalSudoku.getHardDifficulty(),
    puzzleId: window.VocalSudoku.getPuzzle('hard').id,
    value: state.entries[${result.persistedIndex}],
    historyLength: state.history.length,
    elapsedSeconds: state.elapsedSeconds,
    restoredFlag: window.VocalSudoku.getSaveStatus().restored.hard,
    restoredNotice: document.querySelector('.save-notice').textContent.indexOf('已恢复上次未完成棋局') !== -1
  };
}())`);
if (!restored.modeChecked || restored.difficulty !== 'diabolical' ||
    restored.puzzleId !== result.persistedPuzzleId || restored.value !== result.persistedValue ||
    restored.historyLength !== result.persistedHistoryLength ||
    restored.elapsedSeconds < result.persistedElapsedSeconds || !restored.restoredFlag || !restored.restoredNotice) {
  throw new Error('Saved game did not restore correctly: ' + JSON.stringify(restored));
}

const builtinBgm = await evaluate(`new Promise(function (resolve, reject) {
  var audio = new Audio('./assets/bgm/shang-shan-gang.m4a');
  var timeout = setTimeout(function () { cleanup(); reject(new Error('BGM decode timeout')); }, 10000);
  function cleanup() { clearTimeout(timeout); audio.pause(); audio.removeAttribute('src'); audio.load(); }
  audio.onerror = function () { cleanup(); reject(new Error('BGM decode failed')); };
  audio.onloadedmetadata = function () {
    var duration = audio.duration;
    audio.play().then(function () {
      setTimeout(function () {
        var result = { duration: duration, advanced: audio.currentTime > 0, paused: audio.paused };
        cleanup(); resolve(result);
      }, 200);
    }).catch(function (error) { cleanup(); reject(error); });
  };
})`);
if (!(builtinBgm.duration > 0) || !builtinBgm.advanced || builtinBgm.paused) {
  throw new Error('Packaged BGM did not play: ' + JSON.stringify(builtinBgm));
}
const viewportResults = [];
for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await evaluate(`new Promise(function (resolve) { setTimeout(resolve, 100); })`);
  const layout = await evaluate(`(function () {
    var dock = document.querySelector('.bottom-dock').getBoundingClientRect();
    var root = document.documentElement;
    root.style.setProperty('--safe-area-inset-top', '20px');
    root.style.setProperty('--safe-area-inset-bottom', '20px');
    document.querySelector('.avatar-manager-open').click();
    var sheet = document.querySelector('.modal-sheet').getBoundingClientRect();
    var result = {
      width: window.innerWidth, height: window.innerHeight,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      dockVisible: dock.bottom <= window.innerHeight + 1 && dock.top >= 0,
      modalInsideViewport: sheet.top >= 0 && sheet.bottom <= window.innerHeight + 1
    };
    ['simple', 'hard'].forEach(function (mode) {
      var radio = document.getElementById('mode-' + mode);
      radio.checked = true; radio.dispatchEvent(new Event('change'));
      var selector = '.candidate-grid.' + (mode === 'simple' ? 'four' : 'nine');
      var avatars = document.querySelectorAll(selector + ' .candidate-avatar');
      result[mode + 'AvatarsSquare'] = Array.prototype.every.call(avatars, function (avatar) {
        var rect = avatar.getBoundingClientRect();
        return rect.width > 0 && Math.abs(rect.width - rect.height) < 0.5;
      });
      if (mode === 'hard') {
        var buttons = document.querySelectorAll(selector + ' .candidate');
        var rows = {};
        Array.prototype.forEach.call(buttons, function (button) {
          var top = Math.round(button.getBoundingClientRect().top);
          rows[top] = (rows[top] || 0) + 1;
        });
        result.nineRows = Object.values(rows);
      }
    });
    return result;
  }())`);
  if (!layout.noHorizontalOverflow || !layout.dockVisible || !layout.modalInsideViewport ||
      !layout.simpleAvatarsSquare || !layout.hardAvatarsSquare || JSON.stringify(layout.nineRows) !== '[5,4]') {
    throw new Error('Viewport layout failed: ' + JSON.stringify(layout));
  }
  viewportResults.push(layout);
  await evaluate(`document.querySelector('.modal-close').click(); document.querySelector('.selector-card').scrollIntoView({ block: 'center' });`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(screenshotPath.replace(/\.png$/, '-' + width + 'x' + height + '.png'), Buffer.from(shot.data, 'base64'));
  await evaluate(`document.querySelector('.modal-close').click(); document.documentElement.style.removeProperty('--safe-area-inset-top'); document.documentElement.style.removeProperty('--safe-area-inset-bottom');`);
}
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
const offlineCompleted = await evaluate(`(function () {
  var radio = document.getElementById('mode-simple'); radio.checked = true; radio.dispatchEvent(new Event('change'));
  document.querySelectorAll('.tool-button')[2].click();
  var puzzle = window.VocalSudoku.getPuzzle('simple');
  puzzle.givens.forEach(function (value, index) {
    if (value === 0) {
      document.querySelectorAll('.board-4 .cell')[index].click();
      document.querySelectorAll('.candidate-grid.four .candidate')[puzzle.solution[index] - 1].click();
    }
  });
  return window.VocalSudoku.getState('simple').status === 'completed';
}())`);
if (!offlineCompleted) { throw new Error('Offline game completion failed.'); }
if (failedResources.length || runtimeErrors.length) { throw new Error('Browser errors: ' + JSON.stringify({ failedResources, runtimeErrors })); }
await send('Emulation.setDeviceMetricsOverride', { width: 500, height: 900, deviceScaleFactor: 1, mobile: true });
await evaluate('document.querySelector(".avatar-manager-open").click()');
const screenshot = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
await send('Browser.close');
socket.close();
console.log('Browser interaction smoke: PASS');
const report = { interaction: result, restored, media: mediaRestored, builtinBgm, viewports: viewportResults, offlineCompleted, failedResources, runtimeErrors };
await writeFile(screenshotPath.replace(/\.png$/, '-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
