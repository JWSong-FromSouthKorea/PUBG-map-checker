import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { updateRotationsFromCrawl } from '../../crawler/index.js';
import { getLatestCrawlLog } from '../../db/queries.js';
import type { Command } from '../client.js';

export const updateCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('update')
    .setDescription('Manually update map rotation data (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const success = await updateRotationsFromCrawl();

      if (success) {
        const log = await getLatestCrawlLog();
        await interaction.editReply({
          content: `✅ Map rotation data updated successfully!\n\n${log?.message || ''}`,
        });
      } else {
        await interaction.editReply({
          content: '⚠️ Could not find or parse Map Service Report. Data may be outdated.',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await interaction.editReply({
        content: `❌ Failed to update rotation data: ${message}`,
      });
    }
  },
};
