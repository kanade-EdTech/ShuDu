# 数据区

本目录用于存放构建期生成、校验或转换的数据，不直接进入发布包。

- M2 已生成 `reports/4x4-bank-report.json` 与 `reports/9x9-bank-report.json` 两份题库校验报告。
- 原始大型题库始终保留在开发环境，不得由构建白名单复制。
- 最终运行时题库必须经过唯一解校验。当前 4×4 题库生成到项目根目录的经典脚本 `puzzle-bank-4x4.js`，由发布白名单复制；原始 JSONL 不进入发布包。
- 9×9 题库从 Sudoku Exchange 的 `easy.txt`、`medium.txt`、`hard.txt` 与 `diabolical.txt` 分档固定种子抽样，生成经典脚本 `puzzle-bank-9x9.js`；原始数据库目录不进入发布包。
- `scripts/exchange-puzzle-repository.mjs` 可在开发/构建环境按固定记录偏移直接读取完整 893,916 道源题，不需要把四个文件整体载入内存。
