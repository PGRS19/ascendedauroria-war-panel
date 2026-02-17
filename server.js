const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

const GUILD_NAME = "ShellPatrocina";
const GUILD_URL = `https://rubinot.com.br/?subtopic=guilds&page=view&GuildName=${GUILD_NAME}`;

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

// ===== SCRAPING SITE OFICIAL =====
async function fetchGuildData() {
  try {
    const response = await axios.get(GUILD_URL, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    console.log("✅ HTML recebido:", response.status);
    console.log("📄 Tamanho HTML:", response.data.length);

    return response.data;
  } catch (error) {
    console.error("❌ Erro scraping:", error.response?.status || error.message);
    return null;
  }
}

// ===== PROCESSAR HTML =====
async function updateGuildData() {
  const html = await fetchGuildData();
  if (!html) return;

  const $ = cheerio.load(html);
  const today = new Date().toISOString().split("T")[0];

  let encontrados = 0;

  // Procurar todas as tabelas
  $("table").each((i, table) => {
    const rows = $(table).find("tr");

    rows.each((j, row) => {
      const cols = $(row).find("td");

      if (cols.length >= 3) {
        const name = $(cols[0]).text().trim();
        const levelText = $(cols[1]).text().replace(/\D/g, "");
        const level = parseInt(levelText);

        if (name && !isNaN(level)) {
          encontrados++;

          // Vamos usar level como base até confirmarmos onde está XP
          db.run(
            "INSERT INTO players (name, exp, date) VALUES (?, ?, ?)",
            [name, level, today]
          );
        }
      }
    });
  });

  console.log("🎯 Players encontrados:", encontrados);
}

// ===== CRON =====
cron.schedule("*/10 * * * *", () => {
  console.log("⏳ Atualizando guild...");
  updateGuildData();
});

// ===== ROTA PRINCIPAL =====
app.get("/", (req, res) => {
  db.all(
    `
    SELECT 
      name,
      SUM(exp) as total_exp
    FROM players
    WHERE date = date('now')
    GROUP BY name
    ORDER BY total_exp DESC
    `,
    [],
    (err, rows) => {
      if (err) {
        return res.send("Erro no banco.");
      }

      res.send(`
        <h1>Guild ${GUILD_NAME}</h1>
        <h2>Ranking Hoje</h2>
        <p>Total players: ${rows.length}</p>
        <table border="1" cellpadding="5">
          <tr>
            <th>Player</th>
            <th>Total Registrado</th>
          </tr>
          ${rows
            .map(
              (r) =>
                `<tr><td>${r.name}</td><td>${r.total_exp}</td></tr>`
            )
            .join("")}
        </table>
      `);
    }
  );
});

// ===== DEBUG =====
app.get("/debug", async (req, res) => {
  const html = await fetchGuildData();
  if (!html) return res.send("Erro ao buscar HTML.");

  res.send(`
    <h2>Debug Rubinot</h2>
    <p>Tamanho HTML: ${html.length}</p>
    <pre style="white-space: pre-wrap; font-size:10px;">
      ${html.substring(0, 5000)}
    </pre>
  `);
});

// ===== START =====
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
