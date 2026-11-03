const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '../messages');
const EN_DIR = path.join(MESSAGES_DIR, 'en');
const locales = ['ja', 'zh-CN', 'ko', 'es', 'fr', 'it', 'pl', 'nl', 'de'];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
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

function setNested(obj, pathValue, value) {
  const keys = pathValue.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function localizedSeed(locale, value) {
  if (typeof value === 'string') {
    return `[${locale.toUpperCase()}] ${value}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? `[${locale.toUpperCase()}] ${item}` : item));
  }
  return value;
}

function listEnNamespaces() {
  return fs
    .readdirSync(EN_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort();
}

function syncNamespace(locale, namespace) {
  const enFile = path.join(EN_DIR, `${namespace}.json`);
  const localeDir = path.join(MESSAGES_DIR, locale);
  const targetFile = path.join(localeDir, `${namespace}.json`);

  fs.mkdirSync(localeDir, {recursive: true});

  const en = readJson(enFile);
  const target = readJson(targetFile);
  const enFlat = flattenKeys(en);
  const targetFlat = flattenKeys(target);

  let updatedCount = 0;

  for (const [key, value] of Object.entries(enFlat)) {
    if (targetFlat[key] === undefined) {
      setNested(target, key, localizedSeed(locale, value));
      updatedCount++;
    }
  }

  writeJson(targetFile, target);
  return updatedCount;
}

async function main() {
  const namespaces = listEnNamespaces();
  console.log(`Syncing i18n keys from en/* (${namespaces.join(', ')})...`);

  for (const locale of locales) {
    let updatedCount = 0;
    for (const namespace of namespaces) {
      updatedCount += syncNamespace(locale, namespace);
    }

    if (updatedCount > 0) {
      console.log(`Synced ${updatedCount} keys for ${locale}`);
    } else {
      console.log(`${locale} is up to date.`);
    }
  }

  console.log('Sync complete.');
}

main().catch(console.error);
