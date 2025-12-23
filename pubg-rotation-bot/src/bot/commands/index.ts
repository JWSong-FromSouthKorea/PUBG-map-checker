import { REST, Routes } from 'discord.js';
import { commands } from '../client.js';
import { rotationCommand } from './rotation.js';
import { scheduleCommand } from './schedule.js';
import { updateCommand } from './update.js';
import { botConfig } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';

const commandList = [rotationCommand, scheduleCommand, updateCommand];

export function loadCommands(): void {
  for (const command of commandList) {
    commands.set(command.data.name, command);
  }
  logger.info(`Loaded ${commands.size} commands`);
}

export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(botConfig.discordToken);

  const commandData = commandList.map((cmd) => cmd.data.toJSON());

  try {
    logger.info('Registering slash commands...');

    if (botConfig.guildId) {
      // Guild commands (instant update, for development)
      await rest.put(
        Routes.applicationGuildCommands(botConfig.clientId, botConfig.guildId),
        { body: commandData }
      );
      logger.info('Guild commands registered');
    } else {
      // Global commands (takes up to 1 hour to update)
      await rest.put(Routes.applicationCommands(botConfig.clientId), {
        body: commandData,
      });
      logger.info('Global commands registered');
    }
  } catch (error) {
    logger.error('Failed to register commands', error);
    throw error;
  }
}
