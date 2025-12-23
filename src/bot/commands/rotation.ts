import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getCurrentRotation } from '../../db/queries.js';
import type { Command } from '../client.js';
import type { Region, GameMode } from '../../types/index.js';

const REGION_CHOICES = [
  { name: 'Asia', value: 'AS' },
  { name: 'Southeast Asia', value: 'SEA' },
  { name: 'Europe', value: 'EU' },
  { name: 'North America', value: 'NA' },
  { name: 'South America', value: 'SA' },
  { name: 'Russia', value: 'RU' },
  { name: 'Kakao (Korea)', value: 'KAKAO' },
  { name: 'Console', value: 'CONSOLE' },
];

const MODE_CHOICES = [
  { name: 'Normal', value: 'normal' },
  { name: 'Ranked', value: 'ranked' },
];

const ROLE_EMOJI: Record<string, string> = {
  fixed: '📌',
  favored: '⭐',
  etc: '🔄',
};

export const rotationCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rotation')
    .setDescription('Get current PUBG map rotation')
    .addStringOption((option) =>
      option
        .setName('region')
        .setDescription('Select region')
        .setRequired(false)
        .addChoices(...REGION_CHOICES)
    )
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Select game mode')
        .setRequired(false)
        .addChoices(...MODE_CHOICES)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const region = (interaction.options.getString('region') || 'AS') as Region;
    const mode = (interaction.options.getString('mode') || 'normal') as GameMode;

    const rotation = await getCurrentRotation(region, mode);

    if (!rotation) {
      await interaction.reply({
        content: `No rotation data found for ${region} (${mode}). Try running \`/update\` to fetch latest data.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🗺️ PUBG Map Rotation - ${region}`)
      .setDescription(`**Mode:** ${mode.toUpperCase()} | **Week:** ${rotation.week} | **Patch:** ${rotation.patchVersion}`)
      .setColor(0xf2a900)
      .setTimestamp();

    // Group maps by role
    const fixedMaps = rotation.maps.filter((m) => m.role === 'fixed');
    const favoredMaps = rotation.maps.filter((m) => m.role === 'favored');
    const etcMaps = rotation.maps.filter((m) => m.role === 'etc');

    if (fixedMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.fixed} Fixed Maps (Always Available)`,
        value: fixedMaps.map((m) => m.name).join(', '),
        inline: false,
      });
    }

    if (favoredMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.favored} Favored Maps (High Frequency)`,
        value: favoredMaps.map((m) => m.name).join(', '),
        inline: false,
      });
    }

    if (etcMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.etc} Etc Maps (Rotating)`,
        value: etcMaps.map((m) => m.name).join(', '),
        inline: false,
      });
    }

    embed.addFields({
      name: '📅 Period',
      value: `${rotation.startDate} ~ ${rotation.endDate}`,
      inline: true,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
