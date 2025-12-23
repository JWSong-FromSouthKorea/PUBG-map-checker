import { getDatabase } from './index.js';
import type { WeeklyRotation, CrawlLog, Region, GameMode, MapEntry } from '../types/index.js';

// Save rotation data
export function saveRotation(rotation: WeeklyRotation): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO rotations
    (region, mode, week, patch_version, maps, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    rotation.region,
    rotation.mode,
    rotation.week,
    rotation.patchVersion,
    JSON.stringify(rotation.maps),
    rotation.startDate,
    rotation.endDate
  );
}

// Save multiple rotations in a transaction
export function saveRotations(rotations: WeeklyRotation[]): void {
  const db = getDatabase();
  const insertMany = db.transaction((items: WeeklyRotation[]) => {
    for (const rotation of items) {
      saveRotation(rotation);
    }
  });
  insertMany(rotations);
}

// Get current rotation for a region and mode
export function getCurrentRotation(
  region: Region,
  mode: GameMode
): WeeklyRotation | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    SELECT * FROM rotations
    WHERE region = ? AND mode = ?
    AND start_date <= ? AND end_date >= ?
    ORDER BY week DESC
    LIMIT 1
  `);

  const row = stmt.get(region, mode, now, now) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as number,
    region: row.region as Region,
    mode: row.mode as GameMode,
    week: row.week as number,
    patchVersion: row.patch_version as string,
    maps: JSON.parse(row.maps as string) as MapEntry[],
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    createdAt: row.created_at as string,
  };
}

// Get upcoming rotations for a region
export function getUpcomingRotations(
  region: Region,
  mode: GameMode,
  limit = 4
): WeeklyRotation[] {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    SELECT * FROM rotations
    WHERE region = ? AND mode = ?
    AND end_date >= ?
    ORDER BY start_date ASC
    LIMIT ?
  `);

  const rows = stmt.all(region, mode, now, limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as number,
    region: row.region as Region,
    mode: row.mode as GameMode,
    week: row.week as number,
    patchVersion: row.patch_version as string,
    maps: JSON.parse(row.maps as string) as MapEntry[],
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    createdAt: row.created_at as string,
  }));
}

// Get all rotations for current patch
export function getRotationsByPatch(patchVersion: string): WeeklyRotation[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM rotations
    WHERE patch_version = ?
    ORDER BY region, mode, week
  `);

  const rows = stmt.all(patchVersion) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as number,
    region: row.region as Region,
    mode: row.mode as GameMode,
    week: row.week as number,
    patchVersion: row.patch_version as string,
    maps: JSON.parse(row.maps as string) as MapEntry[],
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    createdAt: row.created_at as string,
  }));
}

// Save crawl log
export function saveCrawlLog(log: CrawlLog): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO crawl_logs (url, status, message)
    VALUES (?, ?, ?)
  `);

  stmt.run(log.url, log.status, log.message || null);
}

// Get latest crawl log
export function getLatestCrawlLog(): CrawlLog | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM crawl_logs
    ORDER BY crawled_at DESC
    LIMIT 1
  `);

  const row = stmt.get() as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: row.id as number,
    url: row.url as string,
    status: row.status as 'success' | 'failed',
    message: row.message as string | undefined,
    crawledAt: row.crawled_at as string,
  };
}
