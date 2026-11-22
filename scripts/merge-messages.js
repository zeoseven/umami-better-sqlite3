/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const messages = require('../build/extracted-messages.json');

const dest = path.resolve(__dirname, '../src/lang');
const files = fs.readdirSync(dest);
const keys = Object.keys(messages).sort();

/*
This script takes extracted messages and merges them
with the existing files under `lang`. Any newly added
keys will be printed to the console.
 */
files.forEach(file => {
  const lang = require(`../src/lang/${file}`);

  console.log(`Merging ${file}`);

  const merged = keys.reduce((obj, key) => {
    const message = lang[key];

    if (file === 'en-US.json') {
      obj[key] = messages[key].defaultMessage;
    } else {
      obj[key] = message || messages[key].defaultMessage;
    }

    if (!message) {
      console.log(`* Added key ${key}`);
    }

    return obj;
  }, {});

  const json = `${JSON.stringify(merged, null, 2)}\n`;

  fs.writeFileSync(path.resolve(dest, file), json);
});
