import * as cheerio from 'cheerio';
import type { WeeklyRotation, MapEntry, Region, GameMode, MapName, MapRole } from '../types/index.js';
import { logger } from '../utils/logger.js';

const VALID_MAPS: MapName[] = [
  'Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Taego',
  'Deston', 'Karakin', 'Haven', 'Livik', 'Rondo'
];

const MAP_SELECT_REGIONS: Region[] = ['AS', 'SEA', 'KAKAO'];
const RANDOM_MAP_REGIONS: Region[] = ['NA', 'SA', 'EU', 'RU', 'CONSOLE'];

interface ScheduleEntry {
  week: number;
  pcDate: string;
  consoleDate: string;
}

export function isMapServiceReport(html: string): boolean {
  const $ = cheerio.load(html);
  const title = $('title').text().toLowerCase();
  const h3Text = $('h3').text().toLowerCase();
  return title.includes('map service') || h3Text.includes('map service') ||
         title.includes('map rotation') || h3Text.includes('map rotation');
}

export function extractPatchVersion(html: string): string | null {
  const $ = cheerio.load(html);
  const titleText = $('title').text();

  logger.info('Extracting patch version...', { title: titleText.slice(0, 200), htmlLength: html.length });

  // Try title tag first (most reliable for PUBG pages)
  let match = titleText.match(/Update\s+(\d+\.\d+)/i);
  if (match) {
    return match[1];
  }

  // Try h3 with detail-header__title class
  const h3Text = $('h3.detail-header__title').text();
  match = h3Text.match(/(\d+\.\d+)/);
  if (match) {
    return match[1];
  }

  // Fallback to anywhere in first 10000 chars
  match = html.slice(0, 10000).match(/Update\s+(\d+\.\d+)/i);
  return match ? match[1] : null;
}

function parseScheduleTable($: cheerio.CheerioAPI): ScheduleEntry[] {
  const schedules: ScheduleEntry[] = [];

  // Find Schedule section - look for table after "Schedule" h2
  const tables = $('table');

  tables.each((_, table) => {
    const $table = $(table);
    const headerTexts = $table.find('thead th').map((_, el) => $(el).text().trim().toLowerCase()).get();

    // Check if this is the schedule table (has PC and Console columns)
    if (!headerTexts.some(h => h.includes('pc')) || !headerTexts.some(h => h.includes('console'))) {
      return;
    }

    // Parse schedule rows
    $table.find('tbody tr').each((_, row) => {
      const $row = $(row);
      const weekCell = $row.find('th, td').first().text().trim();
      const weekMatch = weekCell.match(/Week\s+(\d+)/i);

      if (!weekMatch) return;

      const week = parseInt(weekMatch[1], 10);
      const cells = $row.find('td').map((_, el) => $(el).text().trim()).get();

      if (cells.length >= 2) {
        schedules.push({
          week,
          pcDate: parseDateString(cells[0]),
          consoleDate: parseDateString(cells[1]),
        });
      }
    });
  });

  logger.info('Parsed schedule', { count: schedules.length, schedules });
  return schedules;
}

function parseDateString(dateStr: string): string {
  // Parse dates like "December 3" or "January 1, 2026"
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12'
  };

  const match = dateStr.match(/(\w+)\s+(\d+)(?:,?\s*(\d{4}))?/i);
  if (!match) return '';

  const month = months[match[1].toLowerCase()];
  const day = match[2].padStart(2, '0');
  const year = match[3] || new Date().getFullYear().toString();

  return `${year}-${month}-${day}`;
}

function findRegionFromContext($: cheerio.CheerioAPI, $table: ReturnType<cheerio.CheerioAPI>): Region | null {
  // Tables are wrapped in .fr-table-wrap, look at previous sibling of wrapper
  const wrapperPrev = $table.closest('.fr-table-wrap').prev().text().trim().toUpperCase();

  // Check wrapper's previous sibling first (most reliable for PUBG HTML structure)
  if (wrapperPrev === 'AS' || wrapperPrev === 'ASIA') return 'AS';
  if (wrapperPrev === 'SEA' || wrapperPrev === 'SOUTHEAST ASIA') return 'SEA';
  if (wrapperPrev.includes('KAKAO') || wrapperPrev === 'KOREA') return 'KAKAO';
  if (wrapperPrev === 'NA' || wrapperPrev === 'NORTH AMERICA') return 'NA';
  if (wrapperPrev === 'SA' || wrapperPrev === 'SOUTH AMERICA') return 'SA';
  if (wrapperPrev === 'EU' || wrapperPrev === 'EUROPE') return 'EU';
  if (wrapperPrev === 'RU' || wrapperPrev === 'RUSSIA' || wrapperPrev === 'CIS') return 'RU';
  if (wrapperPrev.includes('CONSOLE')) return 'CONSOLE';
  if (wrapperPrev.includes('SCHEDULE')) return null; // Skip schedule table

  // Fallback: check previous elements of table directly
  let $prev = $table.prev();
  let attempts = 0;

  while ($prev.length && attempts < 5) {
    const text = $prev.text().trim().toUpperCase();

    if (text === 'AS' || text === 'ASIA') return 'AS';
    if (text === 'SEA' || text === 'SOUTHEAST ASIA') return 'SEA';
    if (text.includes('KAKAO') || text === 'KOREA') return 'KAKAO';
    if (text === 'NA' || text === 'NORTH AMERICA') return 'NA';
    if (text === 'SA' || text === 'SOUTH AMERICA') return 'SA';
    if (text === 'EU' || text === 'EUROPE') return 'EU';
    if (text === 'RU' || text === 'RUSSIA' || text === 'CIS') return 'RU';
    if (text.includes('CONSOLE')) return 'CONSOLE';

    $prev = $prev.prev();
    attempts++;
  }

  return null;
}

function extractMapFromCell(cellText: string): MapName | null {
  const normalizedText = cellText.toLowerCase().trim();

  for (const mapName of VALID_MAPS) {
    if (normalizedText.includes(mapName.toLowerCase())) {
      return mapName;
    }
  }

  return null;
}

function parseMapSelectTable(
  $: cheerio.CheerioAPI,
  $table: ReturnType<cheerio.CheerioAPI>,
  region: Region,
  schedules: ScheduleEntry[],
  patchVersion: string,
  mode: GameMode
): WeeklyRotation[] {
  const rotations: WeeklyRotation[] = [];

  // Get header structure to understand column roles
  const $headerRow = $table.find('thead tr').first();
  const headers = $headerRow.find('th').map((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const colspan = parseInt($(el).attr('colspan') || '1', 10);
    return { text, colspan };
  }).get();

  // Build column role mapping
  const columnRoles: MapRole[] = [];
  for (const header of headers) {
    const role: MapRole = header.text.includes('fixed') ? 'fixed' :
                          header.text.includes('favor') ? 'favored' : // covers both 'favored' and 'favoured'
                          header.text.includes('etc') ? 'etc' : 'etc';
    for (let i = 0; i < header.colspan; i++) {
      columnRoles.push(role);
    }
  }

  // Parse data rows
  $table.find('tbody tr').each((_, row) => {
    const $row = $(row);
    const cells = $row.find('th, td').map((_, el) => $(el).text().trim()).get();

    if (cells.length < 2) return;

    // First cell should be week
    const weekMatch = cells[0].match(/Week\s*(\d+)/i);
    if (!weekMatch) return;

    const week = parseInt(weekMatch[1], 10);
    const maps: MapEntry[] = [];

    // Parse remaining cells for maps
    for (let i = 1; i < cells.length; i++) {
      const mapName = extractMapFromCell(cells[i]);
      if (mapName) {
        // columnRoles[0] is empty (for week column), so use i directly
        const role = columnRoles[i] || 'etc';
        maps.push({ name: mapName, role });
      }
    }

    if (maps.length > 0) {
      // Find dates from schedule
      const schedule = schedules.find(s => s.week === week);
      const isConsole = region === 'CONSOLE';
      const startDate = schedule ? (isConsole ? schedule.consoleDate : schedule.pcDate) : '';

      // End date is the day before next week starts
      const nextSchedule = schedules.find(s => s.week === week + 1);
      let endDate = '';
      if (nextSchedule) {
        const nextStart = new Date(isConsole ? nextSchedule.consoleDate : nextSchedule.pcDate);
        nextStart.setDate(nextStart.getDate() - 1);
        endDate = nextStart.toISOString().split('T')[0];
      } else if (startDate) {
        // Last week - assume 7 days
        const end = new Date(startDate);
        end.setDate(end.getDate() + 6);
        endDate = end.toISOString().split('T')[0];
      }

      rotations.push({
        region,
        mode,
        week,
        patchVersion,
        maps,
        startDate,
        endDate,
      });
    }
  });

  return rotations;
}

function parseFixedMapPool(
  $: cheerio.CheerioAPI,
  $table: ReturnType<cheerio.CheerioAPI>,
  region: Region,
  schedules: ScheduleEntry[],
  patchVersion: string,
  mode: GameMode
): WeeklyRotation[] {
  const rotations: WeeklyRotation[] = [];

  // For Random Map regions, the table shows Fixed Map pool
  // All maps listed are "fixed" role
  const maps: MapEntry[] = [];

  $table.find('tbody tr, thead tr').find('td, th').each((_, cell) => {
    const mapName = extractMapFromCell($(cell).text());
    if (mapName) {
      maps.push({ name: mapName, role: 'fixed' });
    }
  });

  // Create rotation entry for each week using the same fixed pool
  for (const schedule of schedules) {
    const isConsole = region === 'CONSOLE';
    const startDate = isConsole ? schedule.consoleDate : schedule.pcDate;

    const nextSchedule = schedules.find(s => s.week === schedule.week + 1);
    let endDate = '';
    if (nextSchedule) {
      const nextStart = new Date(isConsole ? nextSchedule.consoleDate : nextSchedule.pcDate);
      nextStart.setDate(nextStart.getDate() - 1);
      endDate = nextStart.toISOString().split('T')[0];
    } else if (startDate) {
      const end = new Date(startDate);
      end.setDate(end.getDate() + 6);
      endDate = end.toISOString().split('T')[0];
    }

    if (maps.length > 0 && startDate) {
      rotations.push({
        region,
        mode,
        week: schedule.week,
        patchVersion,
        maps: [...maps],
        startDate,
        endDate,
      });
    }
  }

  return rotations;
}

export function parseRotationTable(
  html: string,
  patchVersion: string
): WeeklyRotation[] {
  const $ = cheerio.load(html);
  const rotations: WeeklyRotation[] = [];

  // First, parse the schedule table to get week dates
  const schedules = parseScheduleTable($);

  if (schedules.length === 0) {
    logger.warn('No schedule found, using default dates');
  }

  const allTables = $('table');
  logger.info('Parsing rotation tables...', { tableCount: allTables.length });

  // Track current mode based on h2 sections
  let currentMode: GameMode = 'normal';

  // Process each table
  allTables.each((idx, table) => {
    const $table = $(table);

    // Check if we've passed a "Ranked" h2
    const prevH2 = $table.prevAll('h2').first().text().toLowerCase();
    if (prevH2.includes('ranked')) {
      currentMode = 'ranked';
    }

    // Skip schedule table (has PC/Console columns)
    const headerTexts = $table.find('thead th').map((_, el) => $(el).text().trim().toLowerCase()).get();
    if (headerTexts.some(h => h.includes('pc') && h.length < 5)) {
      return;
    }

    // Find region from context
    const region = findRegionFromContext($, $table);
    if (!region) {
      logger.debug(`Table ${idx}: Could not determine region, skipping`);
      return;
    }

    logger.info(`Processing table ${idx} for region ${region}`);

    // Check if this is a Map Select region (has Fixed/Favored/Etc columns) or Random Map region
    const hasWeeklyRotation = headerTexts.some(h => h.includes('fixed') || h.includes('favou'));

    let tableRotations: WeeklyRotation[];
    if (hasWeeklyRotation) {
      tableRotations = parseMapSelectTable($, $table, region, schedules, patchVersion, currentMode);
    } else {
      // Check if it's a Fixed Map pool table
      const isFixedPool = $table.prevAll('h4, h3').first().text().toLowerCase().includes('fixed');
      if (isFixedPool || RANDOM_MAP_REGIONS.includes(region)) {
        tableRotations = parseFixedMapPool($, $table, region, schedules, patchVersion, currentMode);
      } else {
        // Try to parse as weekly rotation anyway
        tableRotations = parseMapSelectTable($, $table, region, schedules, patchVersion, currentMode);
      }
    }

    rotations.push(...tableRotations);
  });

  logger.info('Parsed rotations', { count: rotations.length });
  return rotations;
}

// Fallback: manual data entry structure
export function createManualRotation(data: {
  region: Region;
  mode: GameMode;
  week: number;
  patchVersion: string;
  fixed: MapName[];
  favored: MapName[];
  etc: MapName[];
  startDate: string;
  endDate: string;
}): WeeklyRotation {
  const maps: MapEntry[] = [
    ...data.fixed.map(name => ({ name, role: 'fixed' as MapRole })),
    ...data.favored.map(name => ({ name, role: 'favored' as MapRole })),
    ...data.etc.map(name => ({ name, role: 'etc' as MapRole })),
  ];

  return {
    region: data.region,
    mode: data.mode,
    week: data.week,
    patchVersion: data.patchVersion,
    maps,
    startDate: data.startDate,
    endDate: data.endDate,
  };
}
