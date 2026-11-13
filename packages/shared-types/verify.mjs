// Quick numeric sanity check of calculateEstimate/calculateOutturnPct
// against real rows read directly from the Gitoki FW production sheet
// (lot 1: cherry input 355kg -> estimate A1 49.7, A2 14.2, A3 8.875,
// HPC 5.325; actual A1 33, A2 5, A3 3, HPC 7 -> out-turn 13.52% overall,
// matching the 'Ov.All' column in the real workbook).
import { calculateEstimate, calculateOutturnPct } from './src/processing.ts';

const cases = [
  { input: 355, ratio: 0.14, expected: 49.7, label: 'lot1 A1 estimate' },
  { input: 355, ratio: 0.04, expected: 14.2, label: 'lot1 A2 estimate' },
  { input: 355, ratio: 0.025, expected: 8.875, label: 'lot1 A3 estimate' },
  { input: 355, ratio: 0.015, expected: 5.325, label: 'lot1 HPC estimate' },
];

let failed = 0;
for (const c of cases) {
  const got = calculateEstimate(c.input, c.ratio);
  const ok = Math.abs(got - c.expected) < 0.01;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${c.label}: got ${got}, expected ${c.expected}`);
  if (!ok) failed++;
}

// lot1 actual A1=33 against cherry input 355 -> 9.2957...% (matches the
// real sheet's A1 out-turn column, 9.295774647887324).
const outturn = calculateOutturnPct(33, 355);
const outturnOk = Math.abs(outturn - 9.296) < 0.01;
console.log(`${outturnOk ? 'OK  ' : 'FAIL'} lot1 A1 out-turn: got ${outturn}%, expected ~9.296%`);
if (!outturnOk) failed++;

process.exit(failed ? 1 : 0);
