import * as cheerio from 'cheerio';
import type { WeeklyRotation, MapEntry, Region, GameMode, MapName, MapRole } from '../types/index.js';
import { logger } from '../utils/logger.js';

const VALID_MAPS: MapName[] = [
  'Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Taego',
  'Deston', 'Karakin', 'Haven', 'Livik', 'Rondo'
];

const REGIONS: Region[] = ['AS', 'SEA', 'EU', 'NA', 'SA', 'RU', 'KAKAO', 'CONSOLE'];

export function isMapServiceReport(html: string): boolean {
  const $ = cheerio.load(html);
  const title = $('h1').text().toLowerCase();
  return title.includes('map service') || title.includes('map rotation');
}

export function extractPatchVersion(html: string): string | null {
  const $ = cheerio.load(html);
  const h1Text = $('h1').text();
  const titleText = $('title').text();

  logger.info('Extracting patch version...', { h1: h1Text.slice(0, 200), title: titleText.slice(0, 200), htmlLength: html.length });

  // Try h1 first
  let match = h1Text.match(/(\d+\.\d+)/);
  if (match) {
    return match[1];
  }

  // Fallback to title tag
  match = titleText.match(/(\d+\.\d+)/);
  if (match) {
    return match[1];
  }

  // Fallback to anywhere in first 5000 chars (for SPA pre-rendered content)
  match = html.slice(0, 5000).match(/Update\s+(\d+\.\d+)/i);
  return match ? match[1] : null;
}

export function parseRotationTable(
  html: string,
  patchVersion: string
): WeeklyRotation[] {
  const $ = cheerio.load(html);
  const rotations: WeeklyRotation[] = [];

  logger.info('Parsing rotation tables...');

  // Find tables with rotation data
  $('table').each((_, table) => {
    const $table = $(table);
    const headers = $table.find('th').map((_, el) => $(el).text().trim()).get();

    // Check if this looks like a rotation table
    if (!headers.some(h => h.toLowerCase().includes('week') || h.toLowerCase().includes('map'))) {
      return;
    }

    // Try to determine region from context
    let region: Region = 'AS';
    const prevText = $table.prev().text().toLowerCase();
    for (const r of REGIONS) {
      if (prevText.includes(r.toLowerCase())) {
        region = r;
        break;
      }
    }

    // Parse table rows
    $table.find('tbody tr').each((_, row) => {
      const cells = $(row).find('td').map((_, el) => $(el).text().trim()).get();

      if (cells.length < 2) return;

      const weekMatch = cells[0].match(/week\s*(\d+)/i);
      const week = weekMatch ? parseInt(weekMatch[1], 10) : 1;

      const maps: MapEntry[] = [];

      // Parse map names from remaining cells
      for (let i = 1; i < cells.length; i++) {
        const cellText = cells[i];
        for (const mapName of VALID_MAPS) {
          if (cellText.toLowerCase().includes(mapName.toLowerCase())) {
            let role: MapRole = 'etc';
            if (headers[i]?.toLowerCase().includes('fixed')) {
              role = 'fixed';
            } else if (headers[i]?.toLowerCase().includes('favored') || headers[i]?.toLowerCase().includes('favour')) {
              role = 'favored';
            }

            maps.push({ name: mapName, role });
          }
        }
      }

      if (maps.length > 0) {
        // Calculate dates (each week starts Wednesday)
        const baseDate = new Date();
        const startDate = new Date(baseDate);
        startDate.setDate(startDate.getDate() + (week - 1) * 7);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);

        rotations.push({
          region,
          mode: 'normal' as GameMode,
          week,
          patchVersion,
          maps,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        });
      }
    });
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
