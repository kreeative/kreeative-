#!/usr/bin/env node
/* DualEngine unit tests — tiny runner, no dependencies.
 *   node engine/tests/run.js [substring]
 * Every *.test.js file in this folder exports `function (t) { t.test(name, fn) … }`.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const filter = process.argv[2] || '';
const tests = [];
const t = {
  test(name, fn) { tests.push({ name, fn }); },
  assert,
  /** |a − b| ≤ eps */
  near(a, b, eps, msg) { if (!(Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps))) throw new assert.AssertionError({ message: (msg ? msg + ': ' : '') + 'expected ' + b + ' ± ' + eps + ', got ' + a, actual: a, expected: b }); }
};
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
files.forEach(f => {
  const before = tests.length;
  require(path.join(__dirname, f))(t);
  for (let i = before; i < tests.length; i++) tests[i].name = f.replace('.test.js', '') + ' › ' + tests[i].name;
});

let pass = 0, fail = 0;
for (const tc of tests) {
  if (filter && !tc.name.includes(filter)) continue;
  try { tc.fn(); pass++; console.log('  ok   ' + tc.name); }
  catch (e) { fail++; console.log('  FAIL ' + tc.name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed (' + files.length + ' files)');
process.exit(fail ? 1 : 0);
