# ShuDu

An open-source virtual singer themed Sudoku game for Bilibili Toy and RedNote (Xiaohongshu MiniTool), featuring beginner-friendly 4×4 and 9×9 puzzles.

## Development baseline

Node.js 18 or newer is required. The M0 baseline has no third-party npm dependencies.

Clone the project together with the pinned upstream puzzle-bank submodule:

```text
git clone --recurse-submodules https://github.com/kanade-EdTech/ShuDu.git
```

For an existing clone, run `git submodule update --init --recursive` before building or testing.

```text
npm run bank:4x4
npm run bank:9x9
npm run bank
npm run bank:read -- --info
npm run bank:read -- diabolical 119681
npm test
npm run build
npm run verify
npm run check
npm run package
npm run preview:platform
```

The M2 build pipeline validates 100 local 4×4 JSONL puzzles and treats `easy.txt`, `medium.txt`, `hard.txt`, and `diabolical.txt` as four authoritative 9×9 difficulty banks. It deterministically samples 1,000 puzzles from each source file, independently checks all 4,000 for exactly one solution, and emits a compact runtime encoding.

The Node-side repository can directly access any of the 893,916 source puzzles by file and record number without loading the full text bank. The platform release remains a compact offline cache because Toy and Xiaohongshu WebViews cannot access the project filesystem at runtime.

Chinese design and development documents are indexed in [`doc_CN/README.md`](./doc_CN/README.md).

M5 platform artifacts are `dist/toy` and `dist/xhs`. On Windows, `npm run package` builds and verifies both directories and creates `dist/vocal-sudoku-toy.zip` and `dist/vocal-sudoku-xhs.zip`, with `index.html` at each archive root and every entry verified against its source SHA-256. Packaging uses the built-in .NET ZIP library, without npm dependencies.

`npm run preview:platform` serves Toy at `http://127.0.0.1:4173/toy/demo/` and Xiaohongshu at `http://127.0.0.1:4173/xhs/`, with local CSP headers for regression testing. This preview is a local simulation, not a platform deployment. Xiaohongshu excludes user audio import; Toy includes it. Local Chrome tests cover narrow portrait, landscape, safe-area variables, media persistence, and offline game completion. The current built-in BGM is 《上山岗》; the previous synthesized tracks have been removed. Actual Toy preview is available through the Chinese development notes. Xiaohongshu simulator, Chrome 61 and Android/iOS device acceptance are still pending.
