import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './schema.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/rotation.db');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    logger.info('Opening database connection...', { path: DB_PATH });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeDatabase(db);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
