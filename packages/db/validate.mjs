import { readdirSync, readFileSync } from 'node:fs';
import pkg from 'pgsql-parser';
const { parse } = pkg;

const dir = new URL('./migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

let hadError = false;
for (const file of files) {
  const sql = readFileSync(new URL(file, dir), 'utf8');
  try {
    await parse(sql);
    console.log(`OK    ${file}`);
  } catch (err) {
    hadError = true;
    console.error(`FAIL  ${file}`);
    console.error('      ' + err.message.split('\n').join('\n      '));
  }
}
process.exit(hadError ? 1 : 0);
