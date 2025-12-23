import { config } from 'dotenv';
import type { BotConfig } from '../types/index.js';

config();

function getEnv(key: string, required = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

export const botConfig: BotConfig = {
  discordToken: getEnv('DISCORD_TOKEN'),
  clientId: getEnv('DISCORD_CLIENT_ID'),
  guildId: getEnv('DISCORD_GUILD_ID', false),
  crawlSchedule: '0 3 * * 3', // Every Wednesday at 03:00 UTC
  pubgNewsUrl: 'https://pubg.com/en/news',
};
