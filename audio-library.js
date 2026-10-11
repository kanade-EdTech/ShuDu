(function (root) {
  'use strict';
  var Media = root.VocalSudokuMedia;
  var KEY = 'vocal-sudoku-user-audio-v1';
  var tracks = [];
  var audio = new Audio();
  var currentId = null;
  var currentUrl = null;
  var listeners = [];
  var allowed = root.VocalSudokuPlatform.capabilities().canPickAudio;
  audio.loop = true;

  function notify(message) {
    listeners.forEach(function (listener) { listener({ tracks: tracks.slice(), currentId: currentId, playing: !audio.paused, message: message || '' }); });
  }

  function persist(next) {
    root.localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, tracks: next }));
    tracks = next;
  }

  function release() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (currentUrl) { root.URL.revokeObjectURL(currentUrl); currentUrl = null; }
    currentId = null;
  }

  function validate(file) {
    return new Promise(function (resolve, reject) {
      var probe = new Audio();
      var url = root.URL.createObjectURL(file);
      var timeout = root.setTimeout(function () { finish(new Error('音频读取超时，请选择其他文件')); }, 10000);
      function finish(error) {
        root.clearTimeout(timeout);
        probe.onloadedmetadata = null;
        probe.onerror = null;
        probe.removeAttribute('src');
        probe.load();
        root.URL.revokeObjectURL(url);
        if (error) { reject(error); } else { resolve(); }
      }
      probe.onloadedmetadata = function () {
        finish(isFinite(probe.duration) && probe.duration > 0 ? null : new Error('音频时长无效'));
      };
      probe.onerror = function () { finish(new Error('此音频无法播放')); };
      probe.preload = 'metadata';
      probe.src = url;
    });
  }

  function importTrack(file) {
    if (!allowed || !Media.icons.available()) { return Promise.reject(new Error('当前环境不支持音频导入')); }
    if (tracks.length >= 5) { return Promise.reject(new Error('最多保存 5 首，请先删除旧曲目')); }
    if (!file || file.size <= 0 || file.size > 8 * 1024 * 1024 ||
        !/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name) ||
        (file.type && file.type.indexOf('audio/') !== 0 && file.type !== 'video/webm')) {
      return Promise.reject(new Error('请选择不超过 8 MiB 的音频文件'));
    }
    if (file.type && !audio.canPlayType(file.type)) { return Promise.reject(new Error('当前浏览器不支持此音频格式')); }
    return validate(file).then(function () {
      var id = 'audio-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      return Media.assets.request('put', id, file).then(function () {
        var next = tracks.concat([{ id: id, title: file.name.slice(0, 80), size: file.size }]);
        try { persist(next); } catch (error) {
          return Media.assets.request('delete', id).then(function () { throw new Error('曲目设置无法保存，原列表已保留'); });
        }
        notify('音频已保存，点击曲目播放');
      });
    });
  }

  var generation = 0;
  function play(id) {
    generation += 1;
    var token = generation;
    release();
    Media.music.pause();
    return Media.assets.request('get', id).then(function (blob) {
      if (token !== generation) { return; }
      if (!blob) { throw new Error('曲目文件已丢失，请重新导入'); }
      currentId = id;
      currentUrl = root.URL.createObjectURL(blob);
      audio.src = currentUrl;
      audio.volume = Media.music.getState().volume;
      return audio.play();
    }).then(function () { notify(); }).catch(function (error) {
      if (token === generation) { release(); notify('播放失败，请重新点击播放'); }
      throw error;
    });
  }

  function remove(id) {
    var next = tracks.filter(function (track) { return track.id !== id; });
    try { persist(next); } catch (error) { return Promise.reject(new Error('删除设置无法保存')); }
    if (id === currentId) { generation += 1; release(); }
    notify('曲目已删除');
    return Media.assets.request('delete', id);
  }

  try {
    var saved = JSON.parse(root.localStorage.getItem(KEY) || 'null');
    if (saved && saved.schemaVersion === 1 && Array.isArray(saved.tracks)) {
      tracks = saved.tracks.filter(function (track) {
        return track && typeof track.id === 'string' && /^audio-[a-z0-9-]+$/.test(track.id) && typeof track.title === 'string' && track.size > 0 && track.size <= 8 * 1024 * 1024;
      }).slice(0, 5);
    }
  } catch (error) {}

  Media.music.onChange(function (state) {
    audio.volume = state.volume;
    if (state.playing && currentId) { generation += 1; release(); notify(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { generation += 1; release(); notify(); }
  });
  root.addEventListener('pagehide', function () { generation += 1; release(); });
  audio.onerror = function () { release(); notify('音频播放中断'); };
  root.VocalSudokuAudioLibrary = {
    allowed: allowed,
    importTrack: importTrack,
    play: play,
    remove: remove,
    pause: function () { generation += 1; release(); notify(); },
    getState: function () { return { tracks: tracks.slice(), currentId: currentId, playing: !audio.paused }; },
    onChange: function (listener) { listeners.push(listener); }
  };
}(window));
