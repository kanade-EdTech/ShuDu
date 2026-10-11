import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { solve9x9 } from './build-9x9-bank.mjs';
import { ExchangePuzzleRepository } from './exchange-puzzle-repository.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = new ExchangePuzzleRepository(path.resolve(scriptDirectory, '..', 'sudoku-exchange-puzzle-bank'));
await repository.initialize();

const difficulty = process.argv[2];
if (difficulty === '--info') {
  console.log(JSON.stringify(repository.getMetadata(), null, 2));
} else {
  const oneBasedIndex = Number(process.argv[3]);
  if (!difficulty || !Number.isInteger(oneBasedIndex) || oneBasedIndex < 1) {
    throw new Error('Usage: npm run bank:read -- <easy|medium|hard|diabolical> <one-based-index>\n       npm run bank:read -- --info');
  }
  const record = await repository.read(difficulty, oneBasedIndex - 1);
  const solutions = solve9x9(record.givens, 2);
  if (solutions.length !== 1) {
    throw new Error(record.id + ': expected one solution but found ' + solutions.length + '.');
  }
  console.log(JSON.stringify({
    id: record.id,
    source: record.source,
    sourceIndex: record.sourceIndex,
    difficulty: record.difficulty,
    rating: record.rating,
    givens: record.givens,
    solution: solutions[0]
  }, null, 2));
}
