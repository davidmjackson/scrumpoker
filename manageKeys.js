#!/usr/bin/env node

const {
  AccessKeyError,
  createAccessKey,
  getKeysFilePath,
  listAccessKeys,
  removeAccessKey
} = require('./lib/accessKeys');

const KEYS_FILE = getKeysFilePath(__dirname);

// Parse command-line arguments
const [,, command, nameArg] = process.argv;

if (!command || !['generate', 'list', 'remove'].includes(command)) {
  console.error('Usage:');
  console.error('  node manageKeys.js generate <name>');
  console.error('  node manageKeys.js list');
  console.error('  node manageKeys.js remove <name>');
  process.exit(1);
}

function fail(err) {
  if (err instanceof AccessKeyError) {
    console.error(err.message);
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
}

try {
  switch (command) {
    case 'generate': {
      if (!nameArg) {
        console.error('Please supply a name: node manageKeys.js generate <name>');
        process.exit(1);
      }
      const created = createAccessKey(KEYS_FILE, nameArg);
      console.log(`Generated key for "${created.name}":\n${created.value}`);
      break;
    }

    case 'list': {
      const keys = listAccessKeys(KEYS_FILE);
      if (keys.length === 0) {
        console.log('No keys found in keys.json.');
      } else {
        console.log('Existing keys:');
        for (const { name, value, active } of keys) {
          const status = active ? 'active' : 'suspended';
          console.log(`  ${name}: ${value} (${status})`);
        }
      }
      break;
    }

    case 'remove': {
      if (!nameArg) {
        console.error('Please supply a name: node manageKeys.js remove <name>');
        process.exit(1);
      }
      const removed = removeAccessKey(KEYS_FILE, nameArg);
      console.log(`Removed key for "${removed.name}".`);
      break;
    }
  }
} catch (err) {
  fail(err);
}
