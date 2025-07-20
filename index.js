import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

const settingsPath = './settings.json';
let settings = {};

if (fs.existsSync(settingsPath)) {
  settings = JSON.parse(fs.readFileSync(settingsPath));
}

// Save settings helper
function saveSettings() {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

client.on('ready', () => {
  console.log(`${client.user.tag} is online`);
});

// Welcome message + auto role
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

// XP & leveling
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
      .setDescription(levelUpMessage
        ?.replace('{user}', `<@${userId}>`)
        ?.replace('{level}', current.level.toString()) || `<@${userId}> reached level ${current.level}!`)
      .setImage(embedImage || '')
      .setColor('Orange');

    if (levelCh) levelCh.send({ embeds: [embed] });
  }
});

// --- API for dashboard (optional now, later connect frontend)
const app = express();
app.get('/', (_, res) => res.send('Bot is running!'));
app.listen(process.env.PORT || 3000, () => {
  console.log(`Keep-alive server on port ${process.env.PORT || 3000}`);
});

// Load configs from API (optional step to add later)
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

client.login(process.env.BOT_TOKEN);
