import { getDatabase } from './index.js';
import type { WeeklyRotation, CrawlLog, Region, GameMode } from '../types/index.js';

// Save rotation data
export async function saveRotation(rotation: WeeklyRotation): Promise<void> {
  const db = await getDatabase();

  const existingIndex = db.data.rotations.findIndex(
    (r) =>
      r.region === rotation.region &&
      r.mode === rotation.mode &&
      r.week === rotation.week &&
      r.patchVersion === rotation.patchVersion
  );

  if (existingIndex >= 0) {
    db.data.rotations[existingIndex] = {
      ...rotation,
      id: db.data.rotations[existingIndex].id,
      createdAt: db.data.rotations[existingIndex].createdAt,
    };
  } else {
    const maxId = db.data.rotations.reduce((max, r) => Math.max(max, r.id || 0), 0);
    db.data.rotations.push({
      ...rotation,
      id: maxId + 1,
      createdAt: new Date().toISOString(),
    });
  }

  await db.write();
}

// Save multiple rotations
export async function saveRotations(rotations: WeeklyRotation[]): Promise<void> {
  for (const rotation of rotations) {
    await saveRotation(rotation);
  }
}

// Get current rotation for a region and mode
export async function getCurrentRotation(
  region: Region,
  mode: GameMode
): Promise<WeeklyRotation | null> {
  const db = await getDatabase();
  const now = new Date().toISOString().split('T')[0];

  // First try to find rotation matching current date
  let rotation = db.data.rotations.find(
    (r: WeeklyRotation) =>
      r.region === region &&
      r.mode === mode &&
      r.startDate <= now &&
      r.endDate >= now
  );

  // If no match, get the most recent rotation for this region/mode
  if (!rotation) {
    const candidates = db.data.rotations
      .filter((r: WeeklyRotation) => r.region === region && r.mode === mode)
      .sort((a: WeeklyRotation, b: WeeklyRotation) => b.startDate.localeCompare(a.startDate));
    rotation = candidates[0];
  }

  return rotation || null;
}

// Get upcoming rotations for a region
export async function getUpcomingRotations(
  region: Region,
  mode: GameMode,
  limit = 4
): Promise<WeeklyRotation[]> {
  const db = await getDatabase();
  const now = new Date().toISOString().split('T')[0];

  return db.data.rotations
    .filter(
      (r) =>
        r.region === region &&
        r.mode === mode &&
        r.endDate >= now
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, limit);
}

// Get all rotations for current patch
export async function getRotationsByPatch(patchVersion: string): Promise<WeeklyRotation[]> {
  const db = await getDatabase();

  return db.data.rotations
    .filter((r) => r.patchVersion === patchVersion)
    .sort((a, b) => {
      if (a.region !== b.region) return a.region.localeCompare(b.region);
      if (a.mode !== b.mode) return a.mode.localeCompare(b.mode);
      return a.week - b.week;
    });
}

// Save crawl log
export async function saveCrawlLog(log: CrawlLog): Promise<void> {
  const db = await getDatabase();

  const maxId = db.data.crawlLogs.reduce((max, l) => Math.max(max, l.id || 0), 0);
  db.data.crawlLogs.push({
    ...log,
    id: maxId + 1,
    crawledAt: new Date().toISOString(),
  });

  // Keep only last 100 logs
  if (db.data.crawlLogs.length > 100) {
    db.data.crawlLogs = db.data.crawlLogs.slice(-100);
  }

  await db.write();
}

// Get latest crawl log
export async function getLatestCrawlLog(): Promise<CrawlLog | null> {
  const db = await getDatabase();

  if (db.data.crawlLogs.length === 0) return null;

  return db.data.crawlLogs[db.data.crawlLogs.length - 1];
}
