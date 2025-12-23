// PUBG Regions
export type Region = 'AS' | 'SEA' | 'EU' | 'NA' | 'SA' | 'RU' | 'KAKAO' | 'CONSOLE';

// Game modes
export type GameMode = 'normal' | 'ranked';

// Map names
export type MapName =
  | 'Erangel'
  | 'Miramar'
  | 'Sanhok'
  | 'Vikendi'
  | 'Taego'
  | 'Deston'
  | 'Karakin'
  | 'Haven'
  | 'Livik'
  | 'Rondo';

// Map role in rotation
export type MapRole = 'fixed' | 'favored' | 'etc';

// Single map entry in rotation
export interface MapEntry {
  name: MapName;
  role: MapRole;
  probability?: number; // percentage
}

// Weekly rotation for a region
export interface WeeklyRotation {
  id?: number;
  region: Region;
  mode: GameMode;
  week: number; // 1-4
  patchVersion: string;
  maps: MapEntry[];
  startDate: string; // ISO date
  endDate: string; // ISO date
  createdAt?: string;
}

// Crawl log entry
export interface CrawlLog {
  id?: number;
  url: string;
  status: 'success' | 'failed';
  message?: string;
  crawledAt?: string;
}

// Parsed rotation data from crawler
export interface ParsedRotationData {
  patchVersion: string;
  rotations: WeeklyRotation[];
  source: string;
}

// Discord command options
export interface RotationCommandOptions {
  region?: Region;
  mode?: GameMode;
}

export interface ScheduleCommandOptions {
  region?: Region;
  weeks?: number;
}

// Config type
export interface BotConfig {
  discordToken: string;
  clientId: string;
  guildId?: string;
  crawlSchedule: string; // cron expression
  pubgNewsUrl: string;
  googleApiKey?: string;
  googleSearchEngineId?: string;
}
