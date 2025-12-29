import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";

dotenv.config();

const db = new sqlite3.Database("./claims.db");

db.run(`
CREATE TABLE IF NOT EXISTS claims (
  tebex_id TEXT PRIMARY KEY,
  discord_id TEXT
)
`);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const command = new SlashCommandBuilder()
  .setName("redeem")
  .setDescription("Redeem your Tebex purchase")
  .addStringOption(option =>
    option.setName("tebex_id")
      .setDescription("Your Tebex Transaction ID")
      .setRequired(true)
  );

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(
    (await client.login(process.env.DISCORD_TOKEN)).user.id,
    process.env.GUILD_ID
  ),
  { body: [command.toJSON()] }
);

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "redeem") return;

  const tebexId = interaction.options.getString("tebex_id");

  await interaction.deferReply({ ephemeral: true });

  // Check if already claimed
  db.get("SELECT * FROM claims WHERE tebex_id = ?", [tebexId], async (err, row) => {
    if (row) {
      return interaction.editReply("❌ This Tebex ID has already been redeemed.");
    }

    // Validate Tebex ID
    const res = await fetch(`https://plugin.tebex.io/payments/${tebexId}`, {
      headers: {
        "X-Tebex-Secret": process.env.TEBEX_SECRET
      }
    });

    if (res.status !== 200) {
      return interaction.editReply("❌ Invalid Tebex ID.");
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(process.env.CLIENT_ROLE_ID);

    db.run(
      "INSERT INTO claims (tebex_id, discord_id) VALUES (?, ?)",
      [tebexId, interaction.user.id]
    );

    interaction.editReply("✅ Role claimed! Thank you for your purchase.");
  });
});

client.once("ready", () => {
  console.log("Bot is online");
});
