import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActivityType
} from "discord.js";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";

dotenv.config();

/* ---------------- DATABASE ---------------- */

const db = new sqlite3.Database("./claims.db");

db.run(`
CREATE TABLE IF NOT EXISTS claims (
  tebex_id TEXT PRIMARY KEY,
  discord_id TEXT
)
`);

/* ---------------- DISCORD CLIENT ---------------- */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

/* ---------------- SLASH COMMAND ---------------- */

const command = new SlashCommandBuilder()
  .setName("redeem")
  .setDescription("Redeem your Tebex purchase")
  .addStringOption(option =>
    option
      .setName("tebex_id")
      .setDescription("Your Tebex Transaction ID")
      .setRequired(true)
  );

/* ---------------- REGISTER COMMAND ---------------- */

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  const app = await client.login(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(app.user.id, process.env.GUILD_ID),
    { body: [command.toJSON()] }
  );

  console.log("Slash command registered");
}

registerCommands();

/* ---------------- REDEEM HANDLER ---------------- */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "redeem") return;

  const tebexId = interaction.options.getString("tebex_id");
  await interaction.deferReply({ ephemeral: true });

  // Check if already redeemed
  db.get("SELECT * FROM claims WHERE tebex_id = ?", [tebexId], async (err, row) => {
    if (row) {
      return interaction.editReply("❌ This Tebex ID has already been redeemed.");
    }

    // Check Tebex
    try {
      const res = await fetch(`https://plugin.tebex.io/payments/${tebexId}`, {
        headers: {
          "X-Tebex-Secret": process.env.TEBEX_SECRET
        }
      });

      if (!res.ok) {
        return interaction.editReply("❌ Invalid Tebex ID.");
      }

      // Give role
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(process.env.CLIENT_ROLE_ID);

      // Save to database
      db.run(
        "INSERT INTO claims (tebex_id, discord_id) VALUES (?, ?)",
        [tebexId, interaction.user.id]
      );

      interaction.editReply("✅ Role claimed! Welcome to Fuze Studios.");

    } catch (error) {
      console.error(error);
      interaction.editReply("⚠️ Tebex is currently unreachable. Try again later.");
    }
  });
});

/* ---------------- BOT READY ---------------- */

client.once("ready", () => {
  client.user.setPresence({
    activities: [
      {
        name: "Fuze Studios Store",
        type: ActivityType.Watching
      }
    ],
    status: "online"
  });

  console.log("Bot is online and watching Fuze Studios Store");
});
