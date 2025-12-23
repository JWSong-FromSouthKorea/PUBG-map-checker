import { Events, type Interaction } from 'discord.js';
import { client, commands } from '../client.js';
import { logger } from '../../utils/logger.js';

export function registerInteractionEvent(): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      logger.info(`Executing command: ${interaction.commandName}`, {
        user: interaction.user.tag,
        guild: interaction.guild?.name,
      });

      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing command: ${interaction.commandName}`, error);

      const errorMessage = 'There was an error executing this command!';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  });
}
