#!/usr/bin/env node
// Run every test file and report all of them.
// It used to exit at the first failure, so one broken file hid whatever came after it.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const tests = fs.readdirSync(dir)
  .filter(file => file.endsWith('.js') && file !== path.basename(__filename))
  .sort();

const failed = [];
for (const test of tests) {
  console.log('RUN ' + test);
  const result = spawnSync(process.execPath, [path.join(dir, test)], { stdio: 'inherit' });
  if (result.error) {
    console.error('  could not run: ' + result.error.message);
    failed.push({ test, why: result.error.message });
    continue;
  }
  if (result.status !== 0) failed.push({ test, why: 'exit ' + result.status });
}

console.log('');
if (!failed.length) {
  console.log('all ' + tests.length + ' test files passed');
  process.exit(0);
}
console.log(failed.length + ' of ' + tests.length + ' test files failed:');
for (const f of failed) console.log('  ' + f.test + '  (' + f.why + ')');
process.exit(1);
