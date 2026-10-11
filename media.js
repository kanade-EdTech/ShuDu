(function (root) {
  'use strict';

  var DB_NAME = 'vocal-sudoku-media-v1';
  var STORE_NAME = 'assets';
  var ICONS_KEY = 'vocal-sudoku-icons-v1';
  var MUSIC_KEY = 'vocal-sudoku-music-v1';
  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  var builtinFiles = ['1洛天依.png', '2乐正绫.png', '3星尘.jpg', '4言和.png', '5心华.png', '6乐正龙牙.png', '7墨清弦.png', '8徵羽摩柯.png', '9诗岸.png'];
  var db = null;
  var iconListeners = [];
  var iconKeys = { simple: [null, null, null, null], hard: [null, null, null, null, null, null, null, null, null] };
  var iconUrls = { simple: [null, null, null, null], hard: [null, null, null, null, null, null, null, null, null] };

  function openDatabase() {
    return new Promise(function (resolve) {
      if (!root.indexedDB) {
        resolve(null);
        return;
      }
      var request;
      try {
        request = root.indexedDB.open(DB_NAME, 1);
      } catch (error) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = function () { db = request.result; resolve(db); };
      request.onerror = function () { resolve(null); };
    });
  }

  function assetRequest(method, key, value) {
    return new Promise(function (resolve, reject) {
      if (!db) {
        reject(new Error('IndexedDB unavailable.'));
        return;
      }
      var transaction = db.transaction(STORE_NAME, 'readwrite');
      var store = transaction.objectStore(STORE_NAME);
      var request = method === 'put' ? store.put(value, key) : store[method](key);
      transaction.oncomplete = function () { resolve(request.result); };
      transaction.onabort = function () { reject(transaction.error || new Error('Media transaction aborted.')); };
      request.onerror = function () { reject(request.error || new Error('Media storage failed.')); };
    });
  }

  function saveIconMetadata() {
    try {
      root.localStorage.setItem(ICONS_KEY, JSON.stringify({ schemaVersion: 1, simple: iconKeys.simple, hard: iconKeys.hard }));
      return true;
    } catch (error) {
      return false;
    }
  }

  function readIconMetadata() {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(ICONS_KEY) || 'null');
      if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.simple) && parsed.simple.length === 4 &&
          Array.isArray(parsed.hard) && parsed.hard.length === 9) {
        ['simple', 'hard'].forEach(function (mode) {
          iconKeys[mode] = parsed[mode].map(function (key) {
            return typeof key === 'string' && (/^icon-[a-z0-9-]+$/.test(key) || /^builtin:[0-8]$/.test(key)) ? key : null;
          });
        });
      }
    } catch (error) {
      // Invalid optional media preferences safely fall back to built-ins.
    }
  }

  function notifyIcons() {
    for (var index = 0; index < iconListeners.length; index += 1) {
      iconListeners[index]();
    }
  }

  function replaceUrl(mode, index, blob) {
    if (iconUrls[mode][index]) {
      root.URL.revokeObjectURL(iconUrls[mode][index]);
    }
    iconUrls[mode][index] = blob ? root.URL.createObjectURL(blob) : null;
  }

  function loadIcons() {
    var jobs = [];
    ['simple', 'hard'].forEach(function (mode) {
      iconKeys[mode].forEach(function (key, index) {
        if (!key || key.indexOf('builtin:') === 0) {
          return;
        }
        jobs.push(assetRequest('get', key).then(function (blob) {
          if (blob) {
            replaceUrl(mode, index, blob);
          } else {
            iconKeys[mode][index] = null;
          }
        }).catch(function () {
          iconKeys[mode][index] = null;
        }));
      });
    });
    return Promise.all(jobs).then(function () {
      saveIconMetadata();
      notifyIcons();
    });
  }

  function decodeImage(file) {
    return new Promise(function (resolve, reject) {
      var url = root.URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () { root.URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { root.URL.revokeObjectURL(url); reject(new Error('图片无法解码')); };
      image.src = url;
    });
  }

  function canvasBlob(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (webp) {
        if (webp) {
          resolve(webp);
          return;
        }
        canvas.toBlob(resolve, 'image/jpeg', 0.9);
      }, 'image/webp', 0.88);
    });
  }

  function cropImage(file, crop) {
    if (!file || file.size > MAX_IMAGE_BYTES || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      return Promise.reject(new Error('请选择不超过 5 MiB 的 PNG、JPEG 或 WebP 图片'));
    }
    return decodeImage(file).then(function (image) {
      var canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      var zoom = crop.zoom || 1;
      var scale = Math.max(256 / image.naturalWidth, 256 / image.naturalHeight) * zoom;
      var width = image.naturalWidth * scale;
      var height = image.naturalHeight * scale;
      var overflowX = Math.max(0, width - 256);
      var overflowY = Math.max(0, height - 256);
      var x = (256 - width) / 2 + (crop.x || 0) * overflowX / 2;
      var y = (256 - height) / 2 + (crop.y || 0) * overflowY / 2;
      var context = canvas.getContext('2d');
      context.fillStyle = '#f5fbff';
      context.fillRect(0, 0, 256, 256);
      context.drawImage(image, x, y, width, height);
      return canvasBlob(canvas);
    });
  }

  function setIcon(mode, value, file, crop) {
    var index = value - 1;
    var previousKey = iconKeys[mode][index];
    return cropImage(file, crop).then(function (blob) {
      var key = 'icon-' + mode + '-' + value + '-' + Date.now();
      return assetRequest('put', key, blob).then(function () {
        iconKeys[mode][index] = key;
        if (!saveIconMetadata()) {
          iconKeys[mode][index] = previousKey;
          return assetRequest('delete', key).then(function () { throw new Error('图标设置无法保存'); });
        }
        replaceUrl(mode, index, blob);
        notifyIcons();
        if (previousKey && previousKey.indexOf('builtin:') !== 0) {
          assetRequest('delete', previousKey).catch(function () {});
        }
        return true;
      });
    });
  }

  function resetIcons(mode) {
    var previous = iconKeys[mode].slice();
    iconKeys[mode] = previous.map(function () { return null; });
    if (!saveIconMetadata()) {
      iconKeys[mode] = previous;
      throw new Error('恢复默认失败，原配置已保留');
    }
    for (var index = 0; index < iconKeys[mode].length; index += 1) {
      replaceUrl(mode, index, null);
    }
    notifyIcons();
    previous.forEach(function (key) { if (key && key.indexOf('builtin:') !== 0) { assetRequest('delete', key).catch(function () {}); } });
  }

  function moveIcon(mode, from, to) {
    if (!iconKeys[mode] || from < 0 || from >= iconKeys[mode].length || to < 0 || to >= iconKeys[mode].length) {
      return;
    }
    var previous = iconKeys[mode].slice();
    var key = iconKeys[mode][from] || ('builtin:' + from);
    iconKeys[mode][from] = iconKeys[mode][to] || ('builtin:' + to);
    iconKeys[mode][to] = key;
    if (!saveIconMetadata()) {
      iconKeys[mode] = previous;
      throw new Error('排序保存失败，原配置已保留');
    }
    var url = iconUrls[mode][from];
    iconUrls[mode][from] = iconUrls[mode][to];
    iconUrls[mode][to] = url;
    notifyIcons();
  }

  function applyPortrait(element, value, mode) {
    var url = iconUrls[mode][value - 1];
    var key = iconKeys[mode][value - 1];
    if (!url && typeof key === 'string' && key.indexOf('builtin:') === 0) {
      url = './公式服头像/' + builtinFiles[Number(key.slice(8))];
    }
    element.style.backgroundImage = url ? 'url("' + url + '")' : '';
    element.setAttribute('data-icon-source', iconUrls[mode][value - 1] ? 'user' : 'builtin');
  }

  var tracks = [
    { id: 'shang-shan-gang', title: '上山岗', subtitle: 'ilem / 洛天依Official · 内置 BGM', src: './assets/bgm/shang-shan-gang.m4a' }
  ];
  var music = { index: 0, volume: 0.35, playing: false, listeners: [] };
  var builtinAudio = null;
  var musicGeneration = 0;

  function loadMusicSettings() {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(MUSIC_KEY) || 'null');
      if (parsed && parsed.schemaVersion === 1) {
        if (Number.isInteger(parsed.trackIndex) && parsed.trackIndex >= 0 && parsed.trackIndex < tracks.length) { music.index = parsed.trackIndex; }
        if (typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1) { music.volume = parsed.volume; }
      }
    } catch (error) {}
  }

  function saveMusicSettings() {
    try {
      root.localStorage.setItem(MUSIC_KEY, JSON.stringify({ schemaVersion: 1, trackIndex: music.index, volume: music.volume }));
    } catch (error) {}
  }

  function notifyMusic() {
    var state = getMusicState();
    music.listeners.forEach(function (listener) { listener(state); });
  }

  function playMusic() {
    var token = ++musicGeneration;
    if (!root.Audio) { return Promise.reject(new Error('当前环境不支持音频播放')); }
    if (!builtinAudio) {
      builtinAudio = new root.Audio();
      builtinAudio.loop = true;
      builtinAudio.preload = 'none';
      builtinAudio.onerror = function () { pauseMusic(); };
    }
    if (builtinAudio.getAttribute('src') !== tracks[music.index].src) {
      builtinAudio.src = tracks[music.index].src;
    }
    builtinAudio.volume = music.volume;
    var playback = builtinAudio.play();
    music.playing = true;
    notifyMusic();
    return Promise.resolve(playback).then(function () {
      if (token !== musicGeneration) { return; }
      music.playing = true;
      notifyMusic();
    }).catch(function (error) {
      if (token === musicGeneration) { pauseMusic(); throw error; }
    });
  }

  function pauseMusic() {
    musicGeneration += 1;
    music.playing = false;
    if (builtinAudio) { builtinAudio.pause(); }
    notifyMusic();
  }

  function selectTrack(offset) {
    if (tracks.length <= 1) { return; }
    var wasPlaying = music.playing;
    pauseMusic();
    music.index = (music.index + offset + tracks.length) % tracks.length;
    saveMusicSettings();
    if (builtinAudio) {
      builtinAudio.removeAttribute('src');
      builtinAudio.load();
    }
    if (wasPlaying) { playMusic().catch(function () {}); }
    notifyMusic();
  }

  function setVolume(value) {
    music.volume = Math.max(0, Math.min(1, value));
    if (builtinAudio) { builtinAudio.volume = music.volume; }
    saveMusicSettings();
    notifyMusic();
  }

  function getMusicState() {
    return { supported: !!root.Audio, playing: music.playing, volume: music.volume, track: tracks[music.index], trackCount: tracks.length };
  }

  readIconMetadata();
  loadMusicSettings();
  var ready = openDatabase().then(function () { return db ? loadIcons() : null; });

  root.VocalSudokuMedia = {
    ready: ready,
    assets: { request: assetRequest },
    icons: {
      available: function () { return !!db; },
      onChange: function (listener) { iconListeners.push(listener); },
      applyPortrait: applyPortrait,
      getUrl: function (mode, value) { return iconUrls[mode][value - 1]; },
      set: setIcon,
      reset: resetIcons,
      move: moveIcon
    },
    music: {
      play: playMusic,
      pause: pauseMusic,
      previous: function () { selectTrack(-1); },
      next: function () { selectTrack(1); },
      setVolume: setVolume,
      getState: getMusicState,
      onChange: function (listener) { music.listeners.push(listener); },
      pauseForPageHide: pauseMusic
    }
  };
}(typeof window !== 'undefined' ? window : this));
