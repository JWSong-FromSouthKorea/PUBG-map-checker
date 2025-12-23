import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getUpcomingRotations } from '../../db/queries.js';
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

export const scheduleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Get upcoming PUBG map rotation schedule')
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
    )
    .addIntegerOption((option) =>
      option
        .setName('weeks')
        .setDescription('Number of weeks to show (1-4)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(4)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const region = (interaction.options.getString('region') || 'AS') as Region;
    const mode = (interaction.options.getString('mode') || 'normal') as GameMode;
    const weeks = interaction.options.getInteger('weeks') || 4;

    const rotations = await getUpcomingRotations(region, mode, weeks);

    if (rotations.length === 0) {
      await interaction.reply({
        content: `No schedule data found for ${region} (${mode}). Try running \`/update\` to fetch latest data.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`📅 PUBG Map Schedule - ${region}`)
      .setDescription(`**Mode:** ${mode.toUpperCase()} | Showing next ${rotations.length} week(s)`)
      .setColor(0x00b4d8)
      .setTimestamp();

    for (const rotation of rotations) {
      const mapList = rotation.maps
        .map((m) => {
          const emoji = m.role === 'fixed' ? '📌' : m.role === 'favored' ? '⭐' : '🔄';
          return `${emoji} ${m.name}`;
        })
        .join('\n');

      embed.addFields({
        name: `Week ${rotation.week} (${rotation.startDate} ~ ${rotation.endDate})`,
        value: mapList || 'No data',
        inline: true,
      });
    }

    embed.setFooter({
      text: `Patch ${rotations[0].patchVersion} | 📌 Fixed | ⭐ Favored | 🔄 Etc`,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
