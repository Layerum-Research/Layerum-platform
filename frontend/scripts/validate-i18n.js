const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '../messages');
const EN_DIR = path.join(MESSAGES_DIR, 'en');
const locales = ['ja', 'zh-CN', 'ko', 'es', 'fr', 'it', 'pl', 'nl', 'de'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenKeys(obj, prefix = '') {
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? `${prefix}.` : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, flattenKeys(obj[k], pre + k));
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
}

function valueKind(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function listNamespaces(localeDir) {
  if (!fs.existsSync(localeDir)) return [];
  return fs
    .readdirSync(localeDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort();
}

function main() {
  const enNamespaces = listNamespaces(EN_DIR);
  let hasErrors = false;

  for (const locale of locales) {
    const localeDir = path.join(MESSAGES_DIR, locale);
    if (!fs.existsSync(localeDir)) {
      console.error(`❌ Missing locale directory: ${locale}`);
      hasErrors = true;
      continue;
    }

    const localeNamespaces = listNamespaces(localeDir);
    const missingNamespaces = enNamespaces.filter((ns) => !localeNamespaces.includes(ns));
    const extraNamespaces = localeNamespaces.filter((ns) => !enNamespaces.includes(ns));

    if (missingNamespaces.length > 0) {
      console.error(
        `❌ ${locale} is missing namespace files: ${missingNamespaces.join(', ')}`
      );
      hasErrors = true;
    }
    if (extraNamespaces.length > 0) {
      console.error(`⚠️ ${locale} has extra namespace files: ${extraNamespaces.join(', ')}`);
    }

    for (const namespace of enNamespaces) {
      const enFile = path.join(EN_DIR, `${namespace}.json`);
      const localeFile = path.join(localeDir, `${namespace}.json`);

      if (!fs.existsSync(localeFile)) continue;

      const enFlat = flattenKeys(readJson(enFile));
      const targetFlat = flattenKeys(readJson(localeFile));
      const enKeys = Object.keys(enFlat);
      const targetKeys = Object.keys(targetFlat);

      const missing = enKeys.filter((k) => !targetKeys.includes(k));
      const extra = targetKeys.filter((k) => !enKeys.includes(k));
      const typeMismatches = enKeys.filter((k) => {
        if (!targetKeys.includes(k)) return false;
        return valueKind(enFlat[k]) !== valueKind(targetFlat[k]);
      });

      if (missing.length > 0) {
        console.error(
          `❌ ${locale}/${namespace}.json is missing keys: ${missing
            .slice(0, 5)
            .join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}`
        );
        hasErrors = true;
      }
      if (extra.length > 0) {
        console.error(
          `⚠️ ${locale}/${namespace}.json has extra keys: ${extra
            .slice(0, 5)
            .join(', ')}${extra.length > 5 ? ` and ${extra.length - 5} more` : ''}`
        );
      }
      if (typeMismatches.length > 0) {
        const preview = typeMismatches
          .slice(0, 5)
          .map((k) => `${k} (${valueKind(targetFlat[k])} != ${valueKind(enFlat[k])})`)
          .join(', ');
        console.error(
          `❌ ${locale}/${namespace}.json has type mismatches: ${preview}${
            typeMismatches.length > 5 ? ` and ${typeMismatches.length - 5} more` : ''
          }`
        );
        hasErrors = true;
      }
    }

    if (
      missingNamespaces.length === 0 &&
      extraNamespaces.length === 0
    ) {
      console.log(`✅ ${locale} namespace structure checked.`);
    }
  }

  if (hasErrors) {
    console.error('\nValidation failed. Run "node scripts/sync-i18n.js" to fix missing keys.');
    process.exit(1);
  }
}

main();
