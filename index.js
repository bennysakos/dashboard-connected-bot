import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config(); // Load .env (for local testing or Render env vars)

// --- Load secrets from environment ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

// Optional future dashboard values (can be used later)
const CLIENT_ID = process.env.CLIENT_ID || null;
const CLIENT_SECRET = process.env.CLIENT_SECRET || null;
const BASE_URL = process.env.BASE_URL || null;

// --- Discord Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

// --- Load Settings ---
const settingsPath = './settings.json';
let settings = fs.existsSync(settingsPath)
  ? JSON.parse(fs.readFileSync(settingsPath))
  : {};

function saveSettings() {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// --- Bot Ready ---
client.on('ready', () => {
  console.log(`${client.user.tag} is online`);
});

// --- Welcome and Auto Role ---
client.on('guildMemberAdd', async (member) => {
  const guildId = member.guild.id;
  const guildSettings = settings[guildId];
  if (!guildSettings) return;

  // Welcome message
  if (guildSettings.welcome?.enabled) {
    const channel = member.guild.channels.cache.get(guildSettings.welcome.channel);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle(guildSettings.welcome.title || 'Welcome!')
        .setDescription(guildSettings.welcome.message?.replace('{user}', `<@${member.id}>`) || `<@${member.id}> joined!`)
        .setImage(guildSettings.welcome.image || '')
        .setColor('Green');
      channel.send({ embeds: [embed] });
    }
  }

  // Auto role
  if (guildSettings.autoRole?.enabled) {
    const role = member.guild.roles.cache.get(guildSettings.autoRole.roleId);
    if (role) {
      member.roles.add(role).catch(console.error);
    }
  }
});

// --- Leveling System ---
const cooldowns = new Map();
const xpMap = {};

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  if (!settings[guildId]?.leveling?.enabled) return;

  const { xpPerMessage = 10, cooldown = 30, levelUpChannel, levelUpMessage, embedImage } = settings[guildId].leveling;

  // Cooldown check
  const last = cooldowns.get(`${guildId}_${userId}`) || 0;
  if (Date.now() - last < cooldown * 1000) return;
  cooldowns.set(`${guildId}_${userId}`, Date.now());

  // XP logic
  if (!xpMap[guildId]) xpMap[guildId] = {};
  if (!xpMap[guildId][userId]) xpMap[guildId][userId] = { xp: 0, level: 1 };

  xpMap[guildId][userId].xp += xpPerMessage;
  const current = xpMap[guildId][userId];
  const xpNeeded = current.level * 100;

  if (current.xp >= xpNeeded) {
    current.level += 1;
    current.xp = 0;

    const levelCh = message.guild.channels.cache.get(levelUpChannel);
    const embed = new EmbedBuilder()
      .setTitle('Level Up!')
      .setDescription(
        (levelUpMessage || `<@${userId}> reached level {level}!`)
          .replace('{user}', `<@${userId}>`)
          .replace('{level}', current.level.toString())
      )
      .setImage(embedImage || '')
      .setColor('Orange');

    if (levelCh) levelCh.send({ embeds: [embed] });
  }
});

// --- Web Keep-Alive Server ---
const app = express();
app.get('/', (_, res) => res.send('Bot is running!'));
app.listen(PORT, () => {
  console.log(`Keep-alive server running on port ${PORT}`);
});

// --- Auto-init Settings for New Guilds ---
client.on('guildCreate', guild => {
  if (!settings[guild.id]) {
    settings[guild.id] = {
      welcome: { enabled: false },
      autoRole: { enabled: false },
      leveling: { enabled: false }
    };
    saveSettings();
  }
});

// --- Login ---
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is not set in environment variables!");
  process.exit(1);
}

client.login(BOT_TOKEN);

