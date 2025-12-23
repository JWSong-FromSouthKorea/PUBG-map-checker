import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export function initializeDatabase(db: Database.Database): void {
  logger.info('Initializing database schema...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS rotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL,
      mode TEXT NOT NULL,
      week INTEGER NOT NULL,
      patch_version TEXT NOT NULL,
      maps TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(region, mode, week, patch_version)
    );

    CREATE TABLE IF NOT EXISTS crawl_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      crawled_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_rotations_region_mode
      ON rotations(region, mode);

    CREATE INDEX IF NOT EXISTS idx_rotations_dates
      ON rotations(start_date, end_date);
  `);

  logger.info('Database schema initialized');
}
