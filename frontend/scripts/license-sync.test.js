const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('frontend license text matches the repository LICENSE file', () => {
  const rootLicense = fs.readFileSync(path.join(__dirname, '../../LICENSE'), 'utf8');
  const moduleSource = fs.readFileSync(
    path.join(__dirname, '../src/content/license-text.ts'),
    'utf8',
  );
  const match = moduleSource.match(/^export const LICENSE_TEXT = `([\s\S]*)`;\n$/);

  assert.ok(match, 'src/content/license-text.ts must export LICENSE_TEXT as a single template literal');
  assert.equal(match[1], rootLicense);
});
