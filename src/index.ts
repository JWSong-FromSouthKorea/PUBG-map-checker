import { client, startBot, stopBot } from './bot/client.js';
import { loadCommands, registerCommands } from './bot/commands/index.js';
import { registerReadyEvent } from './bot/events/ready.js';
import { registerInteractionEvent } from './bot/events/interactionCreate.js';
import { startScheduler, stopScheduler, initialCrawl } from './scheduler/index.js';
import { getDatabase, closeDatabase } from './db/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('PUBG Map Rotation Discord Bot');
  logger.info('='.repeat(50));

  // Initialize database
  await getDatabase();

  // Load and register commands
  loadCommands();
  await registerCommands();

  // Register event handlers
  registerReadyEvent();
  registerInteractionEvent();

  // Start the bot
  await startBot();

  // Start scheduler for automatic updates
  startScheduler();

  // Run initial crawl if needed
  await initialCrawl();

  logger.info('Bot is fully operational');
}

// Graceful shutdown
async function shutdown(): Promise<void> {
  logger.info('Shutting down...');

  stopScheduler();
  stopBot();
  await closeDatabase();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the application
main().catch((error) => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});

// Keep process alive
process.stdin.resume();
