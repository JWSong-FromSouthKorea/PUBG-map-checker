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
  pubgNewsUrl: "https://pubg.com/en/news",
  googleApiKey: getEnv("GOOGLE_API_KEY", false),
  googleSearchEngineId: getEnv("GOOGLE_SEARCH_ENGINE_ID", false)
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
var DB_PATH = path.join(process.cwd(), "data", "rotations.json");
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
  let rotation = db2.data.rotations.find(
    (r) => r.region === region && r.mode === mode && r.startDate <= now && r.endDate >= now
  );
  if (!rotation) {
    const candidates = db2.data.rotations.filter((r) => r.region === region && r.mode === mode).sort((a, b) => b.startDate.localeCompare(a.startDate));
    rotation = candidates[0];
  }
  return rotation || null;
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

// src/bot/commands/update.ts
import {
  SlashCommandBuilder as SlashCommandBuilder2,
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
  const { googleApiKey, googleSearchEngineId } = botConfig;
  if (!googleApiKey || !googleSearchEngineId) {
    logger.warn("Google API credentials not configured");
    return [];
  }
  const query = "pubg map service report";
  const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleSearchEngineId}&q=${encodeURIComponent(query)}`;
  logger.info("Searching for Map Service Reports via Google...", { query });
  try {
    const response = await axios.get(url, { timeout: 1e4 });
    const items = response.data.items || [];
    logger.info("Google API raw results:", {
      totalItems: items.length,
      items: items.map((i) => ({ title: i.title, link: i.link }))
    });
    const newsLinks = [];
    for (const item of items) {
      const linkMatch = item.link.match(/pubg\.com\/(en|ko)\/news\/(\d+)/);
      if (!linkMatch) continue;
      const versionMatch = item.title.match(/(\d+\.\d+)/);
      const version = versionMatch ? parseFloat(versionMatch[1]) : 0;
      newsLinks.push({
        url: item.link,
        version,
        title: item.title
      });
    }
    logger.info("Parsed versions (before sort):", {
      versions: newsLinks.map((n) => ({ version: n.version, title: n.title, url: n.url }))
    });
    newsLinks.sort((a, b) => b.version - a.version);
    logger.info("Parsed versions (after sort):", {
      versions: newsLinks.map((n) => ({ version: n.version, title: n.title }))
    });
    const top = newsLinks[0];
    if (top) {
      logger.info("Google search completed", { topVersion: top.version, topUrl: top.url });
    } else {
      logger.warn("No pubg.com news links found in search results");
    }
    return newsLinks.map((item) => item.url).slice(0, 5);
  } catch (error) {
    logger.error("Google search failed", error);
    return [];
  }
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
var RANDOM_MAP_REGIONS = ["NA", "SA", "EU", "RU", "CONSOLE"];
function isMapServiceReport(html) {
  const $ = cheerio.load(html);
  const title = $("title").text().toLowerCase();
  const h3Text = $("h3").text().toLowerCase();
  return title.includes("map service") || h3Text.includes("map service") || title.includes("map rotation") || h3Text.includes("map rotation");
}
function extractPatchVersion(html) {
  const $ = cheerio.load(html);
  const titleText = $("title").text();
  logger.info("Extracting patch version...", { title: titleText.slice(0, 200), htmlLength: html.length });
  let match = titleText.match(/Update\s+(\d+\.\d+)/i);
  if (match) {
    return match[1];
  }
  const h3Text = $("h3.detail-header__title").text();
  match = h3Text.match(/(\d+\.\d+)/);
  if (match) {
    return match[1];
  }
  match = html.slice(0, 1e4).match(/Update\s+(\d+\.\d+)/i);
  return match ? match[1] : null;
}
function parseScheduleTable($) {
  const schedules = [];
  const tables = $("table");
  tables.each((_, table) => {
    const $table = $(table);
    const headerTexts = $table.find("thead th").map((_2, el) => $(el).text().trim().toLowerCase()).get();
    if (!headerTexts.some((h) => h.includes("pc")) || !headerTexts.some((h) => h.includes("console"))) {
      return;
    }
    $table.find("tbody tr").each((_2, row) => {
      const $row = $(row);
      const weekCell = $row.find("th, td").first().text().trim();
      const weekMatch = weekCell.match(/Week\s+(\d+)/i);
      if (!weekMatch) return;
      const week = parseInt(weekMatch[1], 10);
      const cells = $row.find("td").map((_3, el) => $(el).text().trim()).get();
      if (cells.length >= 2) {
        schedules.push({
          week,
          pcDate: parseDateString(cells[0]),
          consoleDate: parseDateString(cells[1])
        });
      }
    });
  });
  logger.info("Parsed schedule", { count: schedules.length, schedules });
  return schedules;
}
function parseDateString(dateStr) {
  const months = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12"
  };
  const match = dateStr.match(/(\w+)\s+(\d+)(?:,?\s*(\d{4}))?/i);
  if (!match) return "";
  const month = months[match[1].toLowerCase()];
  const day = match[2].padStart(2, "0");
  const year = match[3] || (/* @__PURE__ */ new Date()).getFullYear().toString();
  return `${year}-${month}-${day}`;
}
function findRegionFromContext($, $table) {
  const wrapperPrev = $table.closest(".fr-table-wrap").prev().text().trim().toUpperCase();
  if (wrapperPrev === "AS" || wrapperPrev === "ASIA") return "AS";
  if (wrapperPrev === "SEA" || wrapperPrev === "SOUTHEAST ASIA") return "SEA";
  if (wrapperPrev.includes("KAKAO") || wrapperPrev === "KOREA") return "KAKAO";
  if (wrapperPrev === "NA" || wrapperPrev === "NORTH AMERICA") return "NA";
  if (wrapperPrev === "SA" || wrapperPrev === "SOUTH AMERICA") return "SA";
  if (wrapperPrev === "EU" || wrapperPrev === "EUROPE") return "EU";
  if (wrapperPrev === "RU" || wrapperPrev === "RUSSIA" || wrapperPrev === "CIS") return "RU";
  if (wrapperPrev.includes("CONSOLE")) return "CONSOLE";
  if (wrapperPrev.includes("SCHEDULE")) return null;
  let $prev = $table.prev();
  let attempts = 0;
  while ($prev.length && attempts < 5) {
    const text = $prev.text().trim().toUpperCase();
    if (text === "AS" || text === "ASIA") return "AS";
    if (text === "SEA" || text === "SOUTHEAST ASIA") return "SEA";
    if (text.includes("KAKAO") || text === "KOREA") return "KAKAO";
    if (text === "NA" || text === "NORTH AMERICA") return "NA";
    if (text === "SA" || text === "SOUTH AMERICA") return "SA";
    if (text === "EU" || text === "EUROPE") return "EU";
    if (text === "RU" || text === "RUSSIA" || text === "CIS") return "RU";
    if (text.includes("CONSOLE")) return "CONSOLE";
    $prev = $prev.prev();
    attempts++;
  }
  return null;
}
function extractMapFromCell(cellText) {
  const normalizedText = cellText.toLowerCase().trim();
  for (const mapName of VALID_MAPS) {
    if (normalizedText.includes(mapName.toLowerCase())) {
      return mapName;
    }
  }
  return null;
}
function parseMapSelectTable($, $table, region, schedules, patchVersion, mode) {
  const rotations = [];
  const $headerRow = $table.find("thead tr").first();
  const headers = $headerRow.find("th").map((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    const colspan = parseInt($(el).attr("colspan") || "1", 10);
    return { text, colspan };
  }).get();
  const columnRoles = [];
  for (const header of headers) {
    const role = header.text.includes("fixed") ? "fixed" : header.text.includes("favor") ? "favored" : (
      // covers both 'favored' and 'favoured'
      header.text.includes("etc") ? "etc" : "etc"
    );
    for (let i = 0; i < header.colspan; i++) {
      columnRoles.push(role);
    }
  }
  $table.find("tbody tr").each((_, row) => {
    const $row = $(row);
    const cells = $row.find("th, td").map((_2, el) => $(el).text().trim()).get();
    if (cells.length < 2) return;
    const weekMatch = cells[0].match(/Week\s*(\d+)/i);
    if (!weekMatch) return;
    const week = parseInt(weekMatch[1], 10);
    const maps = [];
    for (let i = 1; i < cells.length; i++) {
      const mapName = extractMapFromCell(cells[i]);
      if (mapName) {
        const role = columnRoles[i] || "etc";
        maps.push({ name: mapName, role });
      }
    }
    if (maps.length > 0) {
      const schedule = schedules.find((s) => s.week === week);
      const isConsole = region === "CONSOLE";
      const startDate = schedule ? isConsole ? schedule.consoleDate : schedule.pcDate : "";
      const nextSchedule = schedules.find((s) => s.week === week + 1);
      let endDate = "";
      if (nextSchedule) {
        const nextStart = new Date(isConsole ? nextSchedule.consoleDate : nextSchedule.pcDate);
        nextStart.setDate(nextStart.getDate() - 1);
        endDate = nextStart.toISOString().split("T")[0];
      } else if (startDate) {
        const end = new Date(startDate);
        end.setDate(end.getDate() + 6);
        endDate = end.toISOString().split("T")[0];
      }
      rotations.push({
        region,
        mode,
        week,
        patchVersion,
        maps,
        startDate,
        endDate
      });
    }
  });
  return rotations;
}
function parseFixedMapPool($, $table, region, schedules, patchVersion, mode) {
  const rotations = [];
  const maps = [];
  $table.find("tbody tr, thead tr").find("td, th").each((_, cell) => {
    const mapName = extractMapFromCell($(cell).text());
    if (mapName) {
      maps.push({ name: mapName, role: "fixed" });
    }
  });
  for (const schedule of schedules) {
    const isConsole = region === "CONSOLE";
    const startDate = isConsole ? schedule.consoleDate : schedule.pcDate;
    const nextSchedule = schedules.find((s) => s.week === schedule.week + 1);
    let endDate = "";
    if (nextSchedule) {
      const nextStart = new Date(isConsole ? nextSchedule.consoleDate : nextSchedule.pcDate);
      nextStart.setDate(nextStart.getDate() - 1);
      endDate = nextStart.toISOString().split("T")[0];
    } else if (startDate) {
      const end = new Date(startDate);
      end.setDate(end.getDate() + 6);
      endDate = end.toISOString().split("T")[0];
    }
    if (maps.length > 0 && startDate) {
      rotations.push({
        region,
        mode,
        week: schedule.week,
        patchVersion,
        maps: [...maps],
        startDate,
        endDate
      });
    }
  }
  return rotations;
}
function parseRotationTable(html, patchVersion) {
  const $ = cheerio.load(html);
  const rotations = [];
  const schedules = parseScheduleTable($);
  if (schedules.length === 0) {
    logger.warn("No schedule found, using default dates");
  }
  const allTables = $("table");
  logger.info("Parsing rotation tables...", { tableCount: allTables.length });
  let currentMode = "normal";
  allTables.each((idx, table) => {
    const $table = $(table);
    const prevH2 = $table.prevAll("h2").first().text().toLowerCase();
    if (prevH2.includes("ranked")) {
      currentMode = "ranked";
    }
    const headerTexts = $table.find("thead th").map((_, el) => $(el).text().trim().toLowerCase()).get();
    if (headerTexts.some((h) => h.includes("pc") && h.length < 5)) {
      return;
    }
    const region = findRegionFromContext($, $table);
    if (!region) {
      logger.debug(`Table ${idx}: Could not determine region, skipping`);
      return;
    }
    logger.info(`Processing table ${idx} for region ${region}`);
    const hasWeeklyRotation = headerTexts.some((h) => h.includes("fixed") || h.includes("favou"));
    let tableRotations;
    if (hasWeeklyRotation) {
      tableRotations = parseMapSelectTable($, $table, region, schedules, patchVersion, currentMode);
    } else {
      const isFixedPool = $table.prevAll("h4, h3").first().text().toLowerCase().includes("fixed");
      if (isFixedPool || RANDOM_MAP_REGIONS.includes(region)) {
        tableRotations = parseFixedMapPool($, $table, region, schedules, patchVersion, currentMode);
      } else {
        tableRotations = parseMapSelectTable($, $table, region, schedules, patchVersion, currentMode);
      }
    }
    rotations.push(...tableRotations);
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
  data: new SlashCommandBuilder2().setName("update").setDescription("Manually update map rotation data (Admin only)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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
var commandList = [rotationCommand, updateCommand];
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
