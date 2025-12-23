// src/bot/client.ts
import { Client, GatewayIntentBits, Collection } from "discord.js";

// src/utils/config.ts
import { config } from "dotenv";
config();
function getEnv(key, required = true) {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || "";
}
var botConfig = {
  discordToken: getEnv("DISCORD_TOKEN"),
  clientId: getEnv("DISCORD_CLIENT_ID"),
  guildId: getEnv("DISCORD_GUILD_ID", false),
  crawlSchedule: "0 3 * * 3",
  // Every Wednesday at 03:00 UTC
  pubgNewsUrl: "https://pubg.com/en/news"
};

// src/utils/logger.ts
function formatDate() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function log(level, message, data) {
  const timestamp = formatDate();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}
var logger = {
  info: (message, data) => log("info", message, data),
  warn: (message, data) => log("warn", message, data),
  error: (message, data) => log("error", message, data),
  debug: (message, data) => {
    if (process.env.DEBUG) {
      log("debug", message, data);
    }
  }
};

// src/bot/client.ts
var client = new Client({
  intents: [GatewayIntentBits.Guilds]
});
var commands = new Collection();
function startBot() {
  logger.info("Starting Discord bot...");
  return new Promise((resolve, reject) => {
    client.once("ready", () => {
      logger.info("Bot logged in successfully");
      resolve();
    });
    client.once("error", (err) => {
      logger.error("Discord client error", err);
      reject(err);
    });
    client.login(botConfig.discordToken).catch((err) => {
      logger.error("Login failed", err);
      reject(err);
    });
  });
}
function stopBot() {
  client.destroy();
  logger.info("Bot stopped");
}

// src/bot/commands/index.ts
import { REST, Routes } from "discord.js";

// src/bot/commands/rotation.ts
import {
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";

// src/db/index.ts
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var DB_PATH = path.join(__dirname, "../../data/rotations.json");
var defaultData = {
  rotations: [],
  crawlLogs: []
};
var db = null;
async function getDatabase() {
  if (!db) {
    logger.info("Opening database connection...", { path: DB_PATH });
    const adapter = new JSONFile(DB_PATH);
    db = new Low(adapter, defaultData);
    await db.read();
    if (!db.data) {
      db.data = defaultData;
      await db.write();
    }
    logger.info("Database initialized");
  }
  return db;
}
async function closeDatabase() {
  if (db) {
    await db.write();
    db = null;
    logger.info("Database connection closed");
  }
}

// src/db/queries.ts
async function saveRotation(rotation) {
  const db2 = await getDatabase();
  const existingIndex = db2.data.rotations.findIndex(
    (r) => r.region === rotation.region && r.mode === rotation.mode && r.week === rotation.week && r.patchVersion === rotation.patchVersion
  );
  if (existingIndex >= 0) {
    db2.data.rotations[existingIndex] = {
      ...rotation,
      id: db2.data.rotations[existingIndex].id,
      createdAt: db2.data.rotations[existingIndex].createdAt
    };
  } else {
    const maxId = db2.data.rotations.reduce((max, r) => Math.max(max, r.id || 0), 0);
    db2.data.rotations.push({
      ...rotation,
      id: maxId + 1,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  await db2.write();
}
async function saveRotations(rotations) {
  for (const rotation of rotations) {
    await saveRotation(rotation);
  }
}
async function getCurrentRotation(region, mode) {
  const db2 = await getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const rotation = db2.data.rotations.find(
    (r) => r.region === region && r.mode === mode && r.startDate <= now && r.endDate >= now
  );
  return rotation || null;
}
async function getUpcomingRotations(region, mode, limit = 4) {
  const db2 = await getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  return db2.data.rotations.filter(
    (r) => r.region === region && r.mode === mode && r.endDate >= now
  ).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, limit);
}
async function saveCrawlLog(log2) {
  const db2 = await getDatabase();
  const maxId = db2.data.crawlLogs.reduce((max, l) => Math.max(max, l.id || 0), 0);
  db2.data.crawlLogs.push({
    ...log2,
    id: maxId + 1,
    crawledAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (db2.data.crawlLogs.length > 100) {
    db2.data.crawlLogs = db2.data.crawlLogs.slice(-100);
  }
  await db2.write();
}
async function getLatestCrawlLog() {
  const db2 = await getDatabase();
  if (db2.data.crawlLogs.length === 0) return null;
  return db2.data.crawlLogs[db2.data.crawlLogs.length - 1];
}

// src/bot/commands/rotation.ts
var REGION_CHOICES = [
  { name: "Asia", value: "AS" },
  { name: "Southeast Asia", value: "SEA" },
  { name: "Europe", value: "EU" },
  { name: "North America", value: "NA" },
  { name: "South America", value: "SA" },
  { name: "Russia", value: "RU" },
  { name: "Kakao (Korea)", value: "KAKAO" },
  { name: "Console", value: "CONSOLE" }
];
var MODE_CHOICES = [
  { name: "Normal", value: "normal" },
  { name: "Ranked", value: "ranked" }
];
var ROLE_EMOJI = {
  fixed: "\u{1F4CC}",
  favored: "\u2B50",
  etc: "\u{1F504}"
};
var rotationCommand = {
  data: new SlashCommandBuilder().setName("rotation").setDescription("Get current PUBG map rotation").addStringOption(
    (option) => option.setName("region").setDescription("Select region").setRequired(false).addChoices(...REGION_CHOICES)
  ).addStringOption(
    (option) => option.setName("mode").setDescription("Select game mode").setRequired(false).addChoices(...MODE_CHOICES)
  ),
  async execute(interaction) {
    const region = interaction.options.getString("region") || "AS";
    const mode = interaction.options.getString("mode") || "normal";
    const rotation = await getCurrentRotation(region, mode);
    if (!rotation) {
      await interaction.reply({
        content: `No rotation data found for ${region} (${mode}). Try running \`/update\` to fetch latest data.`,
        ephemeral: true
      });
      return;
    }
    const embed = new EmbedBuilder().setTitle(`\u{1F5FA}\uFE0F PUBG Map Rotation - ${region}`).setDescription(`**Mode:** ${mode.toUpperCase()} | **Week:** ${rotation.week} | **Patch:** ${rotation.patchVersion}`).setColor(15902976).setTimestamp();
    const fixedMaps = rotation.maps.filter((m) => m.role === "fixed");
    const favoredMaps = rotation.maps.filter((m) => m.role === "favored");
    const etcMaps = rotation.maps.filter((m) => m.role === "etc");
    if (fixedMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.fixed} Fixed Maps (Always Available)`,
        value: fixedMaps.map((m) => m.name).join(", "),
        inline: false
      });
    }
    if (favoredMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.favored} Favored Maps (High Frequency)`,
        value: favoredMaps.map((m) => m.name).join(", "),
        inline: false
      });
    }
    if (etcMaps.length > 0) {
      embed.addFields({
        name: `${ROLE_EMOJI.etc} Etc Maps (Rotating)`,
        value: etcMaps.map((m) => m.name).join(", "),
        inline: false
      });
    }
    embed.addFields({
      name: "\u{1F4C5} Period",
      value: `${rotation.startDate} ~ ${rotation.endDate}`,
      inline: true
    });
    await interaction.reply({ embeds: [embed] });
  }
};

// src/bot/commands/schedule.ts
import {
  SlashCommandBuilder as SlashCommandBuilder2,
  EmbedBuilder as EmbedBuilder2
} from "discord.js";
var REGION_CHOICES2 = [
  { name: "Asia", value: "AS" },
  { name: "Southeast Asia", value: "SEA" },
  { name: "Europe", value: "EU" },
  { name: "North America", value: "NA" },
  { name: "South America", value: "SA" },
  { name: "Russia", value: "RU" },
  { name: "Kakao (Korea)", value: "KAKAO" },
  { name: "Console", value: "CONSOLE" }
];
var MODE_CHOICES2 = [
  { name: "Normal", value: "normal" },
  { name: "Ranked", value: "ranked" }
];
var scheduleCommand = {
  data: new SlashCommandBuilder2().setName("schedule").setDescription("Get upcoming PUBG map rotation schedule").addStringOption(
    (option) => option.setName("region").setDescription("Select region").setRequired(false).addChoices(...REGION_CHOICES2)
  ).addStringOption(
    (option) => option.setName("mode").setDescription("Select game mode").setRequired(false).addChoices(...MODE_CHOICES2)
  ).addIntegerOption(
    (option) => option.setName("weeks").setDescription("Number of weeks to show (1-4)").setRequired(false).setMinValue(1).setMaxValue(4)
  ),
  async execute(interaction) {
    const region = interaction.options.getString("region") || "AS";
    const mode = interaction.options.getString("mode") || "normal";
    const weeks = interaction.options.getInteger("weeks") || 4;
    const rotations = await getUpcomingRotations(region, mode, weeks);
    if (rotations.length === 0) {
      await interaction.reply({
        content: `No schedule data found for ${region} (${mode}). Try running \`/update\` to fetch latest data.`,
        ephemeral: true
      });
      return;
    }
    const embed = new EmbedBuilder2().setTitle(`\u{1F4C5} PUBG Map Schedule - ${region}`).setDescription(`**Mode:** ${mode.toUpperCase()} | Showing next ${rotations.length} week(s)`).setColor(46296).setTimestamp();
    for (const rotation of rotations) {
      const mapList = rotation.maps.map((m) => {
        const emoji = m.role === "fixed" ? "\u{1F4CC}" : m.role === "favored" ? "\u2B50" : "\u{1F504}";
        return `${emoji} ${m.name}`;
      }).join("\n");
      embed.addFields({
        name: `Week ${rotation.week} (${rotation.startDate} ~ ${rotation.endDate})`,
        value: mapList || "No data",
        inline: true
      });
    }
    embed.setFooter({
      text: `Patch ${rotations[0].patchVersion} | \u{1F4CC} Fixed | \u2B50 Favored | \u{1F504} Etc`
    });
    await interaction.reply({ embeds: [embed] });
  }
};

// src/bot/commands/update.ts
import {
  SlashCommandBuilder as SlashCommandBuilder3,
  PermissionFlagsBits
} from "discord.js";

// src/crawler/fetcher.ts
import axios from "axios";
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
async function fetchPage(url) {
  logger.info("Fetching page...", { url });
  const response = await axios.get(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5"
    },
    timeout: 3e4
  });
  logger.info("Page fetched successfully", { status: response.status });
  return response.data;
}
async function fetchMapServiceReports() {
  const newsUrl = "https://pubg.com/en/news";
  logger.info("Fetching news page to find Map Service Reports...");
  const html = await fetchPage(newsUrl);
  const linkPattern = /href="(\/en\/news\/\d+)"/g;
  const links = [];
  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    links.push(`https://pubg.com${match[1]}`);
  }
  logger.info("Found news links", { count: links.length });
  return links;
}

// src/crawler/parser.ts
import * as cheerio from "cheerio";
var VALID_MAPS = [
  "Erangel",
  "Miramar",
  "Sanhok",
  "Vikendi",
  "Taego",
  "Deston",
  "Karakin",
  "Haven",
  "Livik",
  "Rondo"
];
var REGIONS = ["AS", "SEA", "EU", "NA", "SA", "RU", "KAKAO", "CONSOLE"];
function isMapServiceReport(html) {
  const $ = cheerio.load(html);
  const title = $("h1").text().toLowerCase();
  return title.includes("map service") || title.includes("map rotation");
}
function extractPatchVersion(html) {
  const $ = cheerio.load(html);
  const title = $("h1").text();
  const match = title.match(/(\d+\.\d+)/);
  return match ? match[1] : null;
}
function parseRotationTable(html, patchVersion) {
  const $ = cheerio.load(html);
  const rotations = [];
  logger.info("Parsing rotation tables...");
  $("table").each((_, table) => {
    const $table = $(table);
    const headers = $table.find("th").map((_2, el) => $(el).text().trim()).get();
    if (!headers.some((h) => h.toLowerCase().includes("week") || h.toLowerCase().includes("map"))) {
      return;
    }
    let region = "AS";
    const prevText = $table.prev().text().toLowerCase();
    for (const r of REGIONS) {
      if (prevText.includes(r.toLowerCase())) {
        region = r;
        break;
      }
    }
    $table.find("tbody tr").each((_2, row) => {
      const cells = $(row).find("td").map((_3, el) => $(el).text().trim()).get();
      if (cells.length < 2) return;
      const weekMatch = cells[0].match(/week\s*(\d+)/i);
      const week = weekMatch ? parseInt(weekMatch[1], 10) : 1;
      const maps = [];
      for (let i = 1; i < cells.length; i++) {
        const cellText = cells[i];
        for (const mapName of VALID_MAPS) {
          if (cellText.toLowerCase().includes(mapName.toLowerCase())) {
            let role = "etc";
            if (headers[i]?.toLowerCase().includes("fixed")) {
              role = "fixed";
            } else if (headers[i]?.toLowerCase().includes("favored") || headers[i]?.toLowerCase().includes("favour")) {
              role = "favored";
            }
            maps.push({ name: mapName, role });
          }
        }
      }
      if (maps.length > 0) {
        const baseDate = /* @__PURE__ */ new Date();
        const startDate = new Date(baseDate);
        startDate.setDate(startDate.getDate() + (week - 1) * 7);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        rotations.push({
          region,
          mode: "normal",
          week,
          patchVersion,
          maps,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0]
        });
      }
    });
  });
  logger.info("Parsed rotations", { count: rotations.length });
  return rotations;
}

// src/crawler/index.ts
async function crawlMapServiceReport(url) {
  try {
    logger.info("Crawling Map Service Report...", { url });
    const html = await fetchPage(url);
    if (!isMapServiceReport(html)) {
      logger.warn("Page is not a Map Service Report", { url });
      return null;
    }
    const patchVersion = extractPatchVersion(html);
    if (!patchVersion) {
      logger.warn("Could not extract patch version", { url });
      return null;
    }
    const rotations = parseRotationTable(html, patchVersion);
    await saveCrawlLog({
      url,
      status: "success",
      message: `Parsed ${rotations.length} rotations for patch ${patchVersion}`
    });
    return {
      patchVersion,
      rotations,
      source: url
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to crawl Map Service Report", { url, error: message });
    await saveCrawlLog({
      url,
      status: "failed",
      message
    });
    return null;
  }
}
async function findAndCrawlLatestReport() {
  try {
    const links = await fetchMapServiceReports();
    for (const link of links.slice(0, 10)) {
      const html = await fetchPage(link);
      if (isMapServiceReport(html)) {
        logger.info("Found Map Service Report", { url: link });
        return await crawlMapServiceReport(link);
      }
    }
    logger.warn("No Map Service Report found in recent news");
    return null;
  } catch (error) {
    logger.error("Failed to find Map Service Reports", error);
    return null;
  }
}
async function updateRotationsFromCrawl() {
  await getDatabase();
  const data = await findAndCrawlLatestReport();
  if (!data || data.rotations.length === 0) {
    logger.warn("No rotation data to save");
    return false;
  }
  await saveRotations(data.rotations);
  logger.info("Rotations saved successfully", {
    patch: data.patchVersion,
    count: data.rotations.length
  });
  return true;
}

// src/bot/commands/update.ts
var updateCommand = {
  data: new SlashCommandBuilder3().setName("update").setDescription("Manually update map rotation data (Admin only)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const success = await updateRotationsFromCrawl();
      if (success) {
        const log2 = await getLatestCrawlLog();
        await interaction.editReply({
          content: `\u2705 Map rotation data updated successfully!

${log2?.message || ""}`
        });
      } else {
        await interaction.editReply({
          content: "\u26A0\uFE0F Could not find or parse Map Service Report. Data may be outdated."
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      await interaction.editReply({
        content: `\u274C Failed to update rotation data: ${message}`
      });
    }
  }
};

// src/bot/commands/index.ts
var commandList = [rotationCommand, scheduleCommand, updateCommand];
function loadCommands() {
  for (const command of commandList) {
    commands.set(command.data.name, command);
  }
  logger.info(`Loaded ${commands.size} commands`);
}
async function registerCommands() {
  const rest = new REST().setToken(botConfig.discordToken);
  const commandData = commandList.map((cmd) => cmd.data.toJSON());
  try {
    logger.info("Registering slash commands...");
    if (botConfig.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(botConfig.clientId, botConfig.guildId),
        { body: commandData }
      );
      logger.info("Guild commands registered");
    } else {
      await rest.put(Routes.applicationCommands(botConfig.clientId), {
        body: commandData
      });
      logger.info("Global commands registered");
    }
  } catch (error) {
    logger.error("Failed to register commands", error);
    throw error;
  }
}

// src/bot/events/interactionCreate.ts
import { Events } from "discord.js";
function registerInteractionEvent() {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }
    try {
      logger.info(`Executing command: ${interaction.commandName}`, {
        user: interaction.user.tag,
        guild: interaction.guild?.name
      });
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing command: ${interaction.commandName}`, error);
      const errorMessage = "There was an error executing this command!";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  });
}

// src/scheduler/index.ts
import cron from "node-cron";
var scheduledTask = null;
function startScheduler() {
  if (scheduledTask) {
    logger.warn("Scheduler already running");
    return;
  }
  logger.info("Starting scheduler...", { schedule: botConfig.crawlSchedule });
  scheduledTask = cron.schedule(botConfig.crawlSchedule, async () => {
    logger.info("Scheduled crawl triggered");
    try {
      const success = await updateRotationsFromCrawl();
      if (success) {
        logger.info("Scheduled crawl completed successfully");
      } else {
        logger.warn("Scheduled crawl completed but no data found");
      }
    } catch (error) {
      logger.error("Scheduled crawl failed", error);
    }
  });
  logger.info("Scheduler started");
}
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info("Scheduler stopped");
  }
}
async function initialCrawl() {
  logger.info("Running initial crawl check...");
  try {
    await updateRotationsFromCrawl();
  } catch (error) {
    logger.warn("Initial crawl failed, will retry on schedule", error);
  }
}

// src/index.ts
async function main() {
  logger.info("=".repeat(50));
  logger.info("PUBG Map Rotation Discord Bot");
  logger.info("=".repeat(50));
  await getDatabase();
  loadCommands();
  registerInteractionEvent();
  await startBot();
  await registerCommands();
  startScheduler();
  initialCrawl().catch((err) => logger.warn("Initial crawl failed", err));
  logger.info("Bot is fully operational");
}
async function shutdown() {
  logger.info("Shutting down...");
  stopScheduler();
  stopBot();
  await closeDatabase();
  logger.info("Shutdown complete");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
main().catch((error) => {
  logger.error("Fatal error during startup", error);
  process.exit(1);
});
process.stdin.resume();
