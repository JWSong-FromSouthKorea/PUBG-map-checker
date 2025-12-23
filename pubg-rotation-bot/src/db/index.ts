import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import type { WeeklyRotation, CrawlLog } from '../types/index.js';

export interface DbSchema {
  rotations: WeeklyRotation[];
  crawlLogs: CrawlLog[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/rotations.json');

const defaultData: DbSchema = {
  rotations: [],
  crawlLogs: [],
};

let db: Low<DbSchema> | null = null;

export async function getDatabase(): Promise<Low<DbSchema>> {
  if (!db) {
    logger.info('Opening database connection...', { path: DB_PATH });
    const adapter = new JSONFile<DbSchema>(DB_PATH);
    db = new Low(adapter, defaultData);
    await db.read();
    if (!db.data) {
      db.data = defaultData;
      await db.write();
    }
    logger.info('Database initialized');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.write();
    db = null;
    logger.info('Database connection closed');
  }
}
