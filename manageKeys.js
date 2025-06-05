#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Path to keys.json (assumes manageKeys.js is in the same directory)
const KEYS_FILE = path.join(__dirname, 'keys.json');

// Utility: load existing keys from keys.json (or {} if empty)
function loadKeys() {
  try {
    const raw = fs.readFileSync(KEYS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading keys.json:', err.message);
    process.exit(1);
  }
}

// Utility: save the updated keys object back to keys.json
function saveKeys(obj) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Error writing to keys.json:', err.message);
    process.exit(1);
  }
}

// Generate a secure random key (32 hex characters)
function generateRandomKey() {
  return crypto.randomBytes(16).toString('hex'); 
}

// Parse command-line arguments
const [,, command, nameArg] = process.argv;

if (!command || !['generate', 'list', 'remove'].includes(command)) {
  console.error('Usage:');
  console.error('  node manageKeys.js generate <name>');
  console.error('  node manageKeys.js list');
  console.error('  node manageKeys.js remove <name>');
  process.exit(1);
}

const keys = loadKeys();

switch (command) {
  case 'generate':
    if (!nameArg) {
      console.error('Please supply a name: node manageKeys.js generate <name>');
      process.exit(1);
    }
    if (keys[nameArg]) {
      console.error(`A key named "${nameArg}" already exists. Use a different name or remove it first.`);
      process.exit(1);
    }
    const newKey = generateRandomKey();
    keys[nameArg] = newKey;
    saveKeys(keys);
    console.log(`Generated key for "${nameArg}":\n${newKey}`);
    break;

  case 'list':
    if (Object.keys(keys).length === 0) {
      console.log('No keys found in keys.json.');
    } else {
      console.log('Existing keys:');
      for (const [nm, val] of Object.entries(keys)) {
        console.log(`  ${nm}: ${val}`);
      }
    }
    break;

  case 'remove':
    if (!nameArg) {
      console.error('Please supply a name: node manageKeys.js remove <name>');
      process.exit(1);
    }
    if (!keys[nameArg]) {
      console.error(`No key found with the name "${nameArg}".`);
      process.exit(1);
    }
    delete keys[nameArg];
    saveKeys(keys);
    console.log(`Removed key for "${nameArg}".`);
    break;
}
