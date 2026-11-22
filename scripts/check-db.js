/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const Database = require('better-sqlite3');

if (process.env.SKIP_DB_CHECK) {
  console.log('Skipping database check.');
  process.exit(0);
}

function getDatabasePath(url = process.env.DATABASE_URL || 'file:./data/umami.db') {
  if (/^[a-z]+:\/\//i.test(url)) {
    throw new Error(
      `Unsupported database URL: ${url}. Only SQLite files are supported (e.g. file:./data/umami.db).`,
    );
  }

  const filename = url.startsWith('file:') ? url.substring('file:'.length) : url;

  return path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), filename);
}

function success(msg) {
  console.log(chalk.greenBright(`✓ ${msg}`));
}

function error(msg) {
  console.log(chalk.redBright(`✗ ${msg}`));
}

function checkConnection() {
  const filename = getDatabasePath();

  fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = new Database(filename);

  try {
    const { version } = db.prepare('select sqlite_version() as version').get();

    if (!version) {
      throw new Error('Unable to query the SQLite version.');
    }

    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    success(`Database connection successful (SQLite ${version}).`);
  } finally {
    db.close();
  }
}

try {
  checkConnection();
  success('Database check successful.');
} catch (e) {
  error(e.message);
  process.exit(1);
}
