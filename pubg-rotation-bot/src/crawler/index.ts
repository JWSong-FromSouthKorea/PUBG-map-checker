import { fetchPage, fetchMapServiceReports } from './fetcher.js';
import { isMapServiceReport, extractPatchVersion, parseRotationTable } from './parser.js';
import { saveRotations, saveCrawlLog, getLatestCrawlLog } from '../db/queries.js';
import { getDatabase } from '../db/index.js';
import { logger } from '../utils/logger.js';
import type { ParsedRotationData, WeeklyRotation } from '../types/index.js';

export async function crawlMapServiceReport(url: string): Promise<ParsedRotationData | null> {
  try {
    logger.info('Crawling Map Service Report...', { url });

    const html = await fetchPage(url);

    if (!isMapServiceReport(html)) {
      logger.warn('Page is not a Map Service Report', { url });
      return null;
    }

    const patchVersion = extractPatchVersion(html);
    if (!patchVersion) {
      logger.warn('Could not extract patch version', { url });
      return null;
    }

    const rotations = parseRotationTable(html, patchVersion);

    saveCrawlLog({
      url,
      status: 'success',
      message: `Parsed ${rotations.length} rotations for patch ${patchVersion}`,
    });

    return {
      patchVersion,
      rotations,
      source: url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to crawl Map Service Report', { url, error: message });

    saveCrawlLog({
      url,
      status: 'failed',
      message,
    });

    return null;
  }
}

export async function findAndCrawlLatestReport(): Promise<ParsedRotationData | null> {
  try {
    const links = await fetchMapServiceReports();

    for (const link of links.slice(0, 10)) {
      const html = await fetchPage(link);

      if (isMapServiceReport(html)) {
        logger.info('Found Map Service Report', { url: link });
        return await crawlMapServiceReport(link);
      }
    }

    logger.warn('No Map Service Report found in recent news');
    return null;
  } catch (error) {
    logger.error('Failed to find Map Service Reports', error);
    return null;
  }
}

export async function updateRotationsFromCrawl(): Promise<boolean> {
  // Initialize DB
  getDatabase();

  const data = await findAndCrawlLatestReport();

  if (!data || data.rotations.length === 0) {
    logger.warn('No rotation data to save');
    return false;
  }

  saveRotations(data.rotations);
  logger.info('Rotations saved successfully', {
    patch: data.patchVersion,
    count: data.rotations.length,
  });

  return true;
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  updateRotationsFromCrawl()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      logger.error('Crawler failed', error);
      process.exit(1);
    });
}
