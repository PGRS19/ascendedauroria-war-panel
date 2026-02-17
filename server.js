const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 10000;

const GUILD_NAME = "ShellPatrocina";
const WORLD = "Auroria";

const GUILD_URL =
  "https://rubinot.com.br/?subtopic=guilds&page=view&GuildName=" +
  encodeURIComponent(GUILD_NAME);

const HIGHSCORE_URL =
  "https://rubinot.com.br/?subtopic=highscores&world=" +
  WORLD +
  "&category=experience";

// ========================
// HEADERS PARA EVITAR 403
// ========================
const axiosConfig = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
    "Referer": "https://rubinot.com.br/"
  },
  timeout: 15000
};

// ========================
// BANCO
// ========================
const db = new sqlite3.Database("./database.sqlite");

db.serialize(function () {
  db.run(
    "CREATE TABLE IF NOT EXISTS players (name TEXT, exp INTEGER, date TEXT)"
  );
});

// ========================
// BUSCAR MEMBROS
// ========================
async function fetchGuildMembers() {
  try {
    console.log("Buscando membros da guild...");

    const response = await axios.get(GUILD_URL, axiosConfig);
    const $ = cheerio.load(response.data);

    let members = [];

    $("a").each(function () {
      const href = $(this).attr("href");
      if (href && href.includes("subtopic=characters")) {
        const name = $(this).text().trim();
        if (name.length > 0) {
          members.push(name);
        }
      }
    });

    console.log("Membros encontrados:", members.length);
    return members;

  } catch (err) {
    console.error("Erro ao buscar guild:", err.message);
    return [];
  }
}

// ========================
// BUSCAR HIGHSCORES
// ========================
async function fetchHighscores() {
  try {
    console.log("Buscando highscores...");

    const response = await axios.get(HIGHSCORE_URL, axiosConfig);
    const $ = cheerio.load(response.data);

    let players = [];

    $("table tr").each(function () {
      const cols = $(this).find("td");

      if (cols.length >= 6) {
        const name = $(cols[1]).text().trim();
        const pointsText = $(cols[5]).text().replace(/\./g, "").trim();
        const points = parseInt(pointsText);

        if (name && !isNaN(points)) {
          players.push({ name: name, points: points });
        }
      }
    });

    console.log("Highscores encontrados:", players.length);
    return players;

  } catch (err) {
    console.error("Erro ao buscar highscores:", err.message);
    return [];
  }
}

// ========================
// ATUALIZAR DADOS
// ========================
async function updateData() {
  console.log("=================================");
  console.log("Iniciando atualização...");

  const members = await fetchGuildMembers();
  const highscores = await fetchHighscores();

  if (members.length === 0 || highscores.length === 0) {
    console.log("Sem dados suficientes para atualizar.");
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  members.forEach(function (member) {
    const player = highscores.find(function (p) {
      return p.name === member;
    });

    if (player) {
      db.run(
        "INSERT INTO players (name, exp, date) VALUES (?, ?, ?)",
        [player.name, player.points, today]
      );
    }
  });

  console.log("Atualização concluída.");
  console.log("=================================");
}

// EXECUTA AO INICIAR
updateData();

// CRON A CADA 10 MIN
cron.schedule("*/10 * * * *", function () {
  updateData();
});

// ========================
// ROTA PRINCIPAL
// ========================
app.get("/", function (req, res) {
  db.all(
    "SELECT name, MAX(exp) - MIN(exp) as gained_today FROM players WHERE date = date('now') GROUP BY name ORDER BY gained_today DESC",
    [],
    function (err, rows) {
      if (err) {
        res.send("Erro no banco.");
        return;
      }

      let html = "<h1>Guild " + GUILD_NAME + "</h1>";
      html += "<h2>XP Ganha Hoje</h2>";
      html += "<table border='1' cellpadding='5'>";
      html += "<tr><th>Player</th><th>XP Hoje</th></tr>";

      rows.forEach(function (r) {
        html +=
          "<tr><td>" +
          r.name +
          "</td><td>" +
          (r.gained_today || 0) +
          "</td></tr>";
      });

      html += "</table>";

      res.send(html);
    }
  );
});

app.listen(PORT, function () {
  console.log("Servidor rodando na porta " + PORT);
});
