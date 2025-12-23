import { Client, GatewayIntentBits, Collection } from 'discord.js';
import type { SlashCommandBuilder } from 'discord.js';
import { botConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: unknown) => Promise<void>;
}

export const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

export const commands = new Collection<string, Command>();

export async function startBot(): Promise<void> {
  logger.info('Starting Discord bot...');

  await client.login(botConfig.discordToken);

  logger.info('Bot logged in successfully');
}

export function stopBot(): void {
  client.destroy();
  logger.info('Bot stopped');
}
