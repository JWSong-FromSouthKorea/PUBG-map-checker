import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getCurrentRotation } from '../../db/queries.js';
import type { Command } from '../client.js';
import type { GameMode } from '../../types/index.js';

const MODE_CHOICES = [
  { name: '일반', value: 'normal' },
  { name: '랭크', value: 'ranked' },
];

const MAP_NAMES_KO: Record<string, string> = {
  'Erangel': '에란겔',
  'Miramar': '미라마',
  'Sanhok': '사녹',
  'Vikendi': '비켄디',
  'Taego': '태이고',
  'Deston': '데스턴',
  'Paramo': '파라모',
  'Haven': '헤이븐',
  'Karakin': '카라킨',
  'Rondo': '론도',
};

const ROLE_EMOJI: Record<string, string> = {
  fixed: '📌',
  favored: '⭐',
  etc: '🔄',
};

function translateMapName(name: string): string {
  return MAP_NAMES_KO[name] || name;
}

export const rotationCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rotation')
    .setDescription('현재 배그 맵 로테이션 확인')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('게임 모드 선택')
        .setRequired(false)
        .addChoices(...MODE_CHOICES)
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const mode = (interaction.options.getString('mode') || 'normal') as GameMode;
    const modeLabel = mode === 'normal' ? '일반' : '랭크';

    const rotation = await getCurrentRotation('AS', mode);

    if (!rotation) {
      await interaction.reply({
        content: `${modeLabel} 모드의 로테이션 데이터가 없습니다. \`/update\` 명령어로 최신 데이터를 가져오세요.`,
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🗺️ 배그 맵 로테이션`)
      .setDescription(`**모드:** ${modeLabel} | **${rotation.week}주차** | **패치 ${rotation.patchVersion}**`)
      .setColor(0xf2a900)
      .setTimestamp();

    // Group maps by role
    const fixedMaps = rotation.maps.filter((m) => m.role === 'fixed');
    const favoredMaps = rotation.maps.filter((m) => m.role === 'favored');
    const etcMaps = rotation.maps.filter((m) => m.role === 'etc');

    if (fixedMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.fixed} 고정맵`,
        value: fixedMaps.map((m) => translateMapName(m.name)).join(', '),
        inline: false,
      });
    }

    if (favoredMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.favored} 선호맵`,
        value: favoredMaps.map((m) => translateMapName(m.name)).join(', '),
        inline: false,
      });
    }

    if (etcMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.etc} 기타맵`,
        value: etcMaps.map((m) => translateMapName(m.name)).join(', '),
        inline: false,
      });
    }

    embed.addFields({
      name: '📅 기간',
      value: `${rotation.startDate} ~ ${rotation.endDate}`,
      inline: true,
    });

    await interaction.reply({ embeds: [embed] });
  },
};
