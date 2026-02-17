const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

const GUILD_NAME = "ShellPatrocina";
const WORLD = "Auroria";

const GUILD_URL = `https://rubinot.com.br/?subtopic=guilds&page=view&GuildName=${GUILD_NAME}`;
const HIGHSCORE_URL = `https://rubinot.com.br/?subtopic=highscores&world=${WORLD}&category=experience`;

// ===== BANCO =====
const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      name TEXT,
      exp INTEGER,
      date TEXT
    )
  `);
});

// ===== PEGAR MEMBROS DA GUILD =====
async function fetchGuildMembers() {
  try {
    const response = await axios.get(GUILD_URL);
    const $ = cheerio.load(response.data);

    let members = [];

    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (href && href.includes("subtopic=characters")) {
        const name = $(el).text().trim();
        if (name.length > 0) {
          members.push(name);
        }
      }
    });

    console.log("👥 Membros encontrados:", members.length);
    return members;
  } catch (err) {
    console.error("Erro buscando guild:", err.message);
    return [];
  }
}

// ===== PEGAR HIGHSCORES =====
async function fetchHighscores() {
  try {
    const response = await axios.get(HIGHSCORE_URL);
    const $ = cheerio.load(response.data);

    let players = [];

    $("table tr").each((i, row) => {
      const cols = $(row).find("td");

      if (cols.length >= 6) {
        const name = $(cols[1]).text().trim();
        const pointsText = $(cols[5]).text().replace(/\./g, "").trim();
        const points = parseInt(pointsText);

        if (name && !isNaN(points)) {
          players.push({ name, points });
        }
      }
    });

    console.log("🏆 Highscores capturados:", players.length);
    return players;
  } catch (err) {
    console.error("Erro buscando highscores:", err.message);
    return [];
  }
}

// ===== ATUALIZAR DADOS =====
async function updateData() {
  console.log("⏳ Atualizando dados...");

  const members = await fetchGuildMembers();
  if (members.length === 0) return;

  const highscores = await fetchHighscores();
  if (highscores.length === 0) return;

  const today = new Date().toISOString().split("T")[0];

  members.forEach(member => {
    const playerData = highscores.find(p => p.name === member);

    if (playerData) {
      db.run(
        "INSERT INTO players (name, exp, date) VALUES (?, ?, ?)",
        [playerData.name, playerData.points, today]
      );
    }
  });

  console.log("✅ Atualização concluída.");
}

// ===== CRON =====
cron.schedule("*/10 * * * *", updateData);

// ===== ROTA PRINCIPAL =====
app.get("/", (req, res) => {
  db.all(
    `
    SELECT 
      name,
      MAX(exp) - MIN(exp) as gained_today
    FROM players
    WHERE date = date('now')
    GROUP BY name
    ORDER BY gained_today DESC
    `,
    [],
    (err, rows) => {
      if (err) return res.send("Erro no banco.");

      res.send(`
        <h1>Guild ${GUILD_NAME}</h1>
        <h2>XP Ganha Hoje</h2>
        <table border="1" cellpadding="5">
          <tr>
            <th>Player</th>
            <th>XP Hoje</th>
          </tr>
          ${rows
            .map(
              r =>
                `<tr><td>${r.name}</td><td>${r.gained_today || 0}</td></tr>`
            )
            .join("")}
        </table>
      `);
    }
  );
});

// ===== START =====
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
