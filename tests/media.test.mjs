import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../media.js', import.meta.url), 'utf8');
function setup(initial, denyWrites, features = {}) {
  const data = new Map(initial ? [['vocal-sudoku-icons-v1', JSON.stringify(initial)]] : []);
  const window = {
    localStorage: {
      getItem: key => data.get(key) || null,
      setItem: (key, value) => { if (denyWrites) { throw new Error('quota'); } data.set(key, value); }
    },
    URL: { revokeObjectURL() {} }
  };
  Object.assign(window, features);
  vm.runInNewContext(source, { window });
  return { media: window.VocalSudokuMedia, data };
}

test('default avatars can be reordered and restored independently of the other mode', async () => {
  const { media, data } = setup();
  await media.ready;
  media.icons.move('simple', 0, 1);
  const element = { style: {}, setAttribute() {} };
  media.icons.applyPortrait(element, 1, 'simple');
  assert.match(element.style.backgroundImage, /2乐正绫/);
  assert.equal(JSON.parse(data.get('vocal-sudoku-icons-v1')).hard[0], null);
  media.icons.reset('simple');
  media.icons.applyPortrait(element, 1, 'simple');
  assert.equal(element.style.backgroundImage, '');
});

test('failed metadata writes preserve avatar ordering', () => {
  const { media } = setup(null, true);
  assert.throws(() => media.icons.move('simple', 0, 1), /保存失败/);
  const element = { style: {}, setAttribute() {} };
  media.icons.applyPortrait(element, 1, 'simple');
  assert.equal(element.style.backgroundImage, '');
});

test('invalid icon metadata and rejected images safely fall back', async () => {
  const { media } = setup({ schemaVersion: 1, simple: [42, {}, null, null], hard: new Array(9).fill(null) });
  await media.ready;
  await assert.rejects(media.icons.set('simple', 1, { size: 6 * 1024 * 1024, type: 'image/png' }, {}), /5 MiB/);
  assert.equal(media.icons.available(), false);
  await assert.rejects(media.music.play(), /不支持音频/);
  assert.equal(media.music.getState().playing, false);
});

test('only Shang Shan Gang remains, loops and ignores single-track navigation', async () => {
  let audio;
  class Audio {
    constructor() { audio = this; }
    getAttribute() { return this.src; }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
    load() {}
  }
  const { media, data } = setup(null, false, { Audio });
  assert.equal(media.music.getState().track.id, 'shang-shan-gang');
  await media.music.play();
  assert.equal(audio.src, './assets/bgm/shang-shan-gang.m4a');
  assert.equal(audio.loop, true);
  assert.equal(media.music.getState().playing, true);
  media.music.setVolume(0.2);
  assert.equal(audio.volume, 0.2);
  assert.equal(JSON.parse(data.get('vocal-sudoku-music-v1')).trackIndex, 0);
  assert.equal(media.music.getState().trackCount, 1);
  media.music.next();
  assert.equal(audio.src, './assets/bgm/shang-shan-gang.m4a');
  assert.equal(media.music.getState().playing, true);
  media.music.previous();
  assert.equal(media.music.getState().track.id, 'shang-shan-gang');
  media.music.pause();
  assert.equal(media.music.getState().playing, false);
});

test('a delayed or failed media play cannot resurrect paused music', async () => {
  let resolvePlay, rejectPlay;
  class Audio {
    getAttribute() { return this.src; }
    play() { return new Promise((resolve, reject) => { resolvePlay = resolve; rejectPlay = reject; }); }
    pause() {}
  }
  const { media } = setup(null, false, { Audio });
  const pending = media.music.play();
  media.music.pause();
  resolvePlay();
  await pending;
  assert.equal(media.music.getState().playing, false);
  const failing = media.music.play();
  rejectPlay(new Error('decode failed'));
  await assert.rejects(failing, /decode failed/);
  assert.equal(media.music.getState().playing, false);
});

test('all legacy track indices restore the sole song and preserve volume', () => {
  for (const trackIndex of [0, 1, 2]) {
    const saved = JSON.stringify({ schemaVersion: 1, trackIndex, volume: 0.27 });
    const { media } = setup(null, false, { localStorage: { getItem: key => key === 'vocal-sudoku-music-v1' ? saved : null, setItem() {} } });
    assert.equal(media.music.getState().track.id, 'shang-shan-gang');
    assert.equal(media.music.getState().volume, 0.27);
    assert.equal(media.music.getState().playing, false);
  }
});
