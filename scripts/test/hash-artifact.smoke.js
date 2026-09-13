#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hashFile } = require('../hash-artifact.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'social-pipeline-hash-'));
try {
  const markdownA = path.join(temp, 'a.md');
  const markdownB = path.join(temp, 'b.md');
  fs.writeFileSync(markdownA, '# Draft\r\n\r\nApproved text.   \r\n\r\n## Decision\r\napprove\r\n');
  fs.writeFileSync(markdownB, '# Draft\n\nApproved text.\n');
  assert.strictEqual(hashFile(markdownA).sha256, hashFile(markdownB).sha256);

  const jsonA = path.join(temp, 'a.json');
  const jsonB = path.join(temp, 'b.json');
  fs.writeFileSync(jsonA, '{"value":1}\n');
  fs.writeFileSync(jsonB, '{"value":1}   \r\n');
  assert.notStrictEqual(
    hashFile(jsonA).sha256,
    hashFile(jsonB).sha256,
    'non-Markdown artifacts must use their raw bytes'
  );
  console.log('ok   Markdown normalization is scoped to Markdown artifacts');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
