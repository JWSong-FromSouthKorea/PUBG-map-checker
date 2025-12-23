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
    .setDescription('맵 로테이션 데이터 수동 업데이트 (관리자 전용)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const success = await updateRotationsFromCrawl();

      if (success) {
        const log = await getLatestCrawlLog();
        await interaction.editReply({
          content: `✅ 맵 로테이션 데이터가 업데이트되었습니다!\n\n${log?.message || ''}`,
        });
      } else {
        await interaction.editReply({
          content: '⚠️ Map Service Report를 찾거나 파싱하지 못했습니다. 데이터가 최신이 아닐 수 있습니다.',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      await interaction.editReply({
        content: `❌ 업데이트 실패: ${message}`,
      });
    }
  },
};
