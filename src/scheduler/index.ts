import cron from 'node-cron';
import { updateRotationsFromCrawl } from '../crawler/index.js';
import { botConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let scheduledTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  if (scheduledTask) {
    logger.warn('Scheduler already running');
    return;
  }

  logger.info('Starting scheduler...', { schedule: botConfig.crawlSchedule });

  scheduledTask = cron.schedule(botConfig.crawlSchedule, async () => {
    logger.info('Scheduled crawl triggered');

    try {
      const success = await updateRotationsFromCrawl();
      if (success) {
        logger.info('Scheduled crawl completed successfully');
      } else {
        logger.warn('Scheduled crawl completed but no data found');
      }
    } catch (error) {
      logger.error('Scheduled crawl failed', error);
    }
  });

  logger.info('Scheduler started');
}

export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('Scheduler stopped');
  }
}

// Run immediate crawl on startup if no data exists
export async function initialCrawl(): Promise<void> {
  logger.info('Running initial crawl check...');

  try {
    await updateRotationsFromCrawl();
  } catch (error) {
    logger.warn('Initial crawl failed, will retry on schedule', error);
  }
}
