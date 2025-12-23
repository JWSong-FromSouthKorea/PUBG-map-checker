import { Events } from 'discord.js';
import { client } from '../client.js';
import { logger } from '../../utils/logger.js';

export function registerReadyEvent(): void {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info(`Bot is ready! Logged in as ${readyClient.user.tag}`);
    logger.info(`Serving ${readyClient.guilds.cache.size} guilds`);
  });
}
