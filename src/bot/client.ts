import { Client, GatewayIntentBits, Collection } from 'discord.js';
import type { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { botConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

export const commands = new Collection<string, Command>();

export function startBot(): Promise<void> {
  logger.info('Starting Discord bot...');

  return new Promise((resolve, reject) => {
    client.once('ready', () => {
      logger.info('Bot logged in successfully');
      resolve();
    });
    client.once('error', (err) => {
      logger.error('Discord client error', err);
      reject(err);
    });
    client.login(botConfig.discordToken).catch((err) => {
      logger.error('Login failed', err);
      reject(err);
    });
  });
}

export function stopBot(): void {
  client.destroy();
  logger.info('Bot stopped');
}
