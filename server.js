const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

const GUILD_NAME = "ShellPatrocina";
const WORLD = "Auroria";

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

// ===== SCRAPING =====
async function fetchGuildData() {
  try {
    const response = await axios.get(
      `https://rubinothings.com.br/guild.php?guild=${GUILD_NAME}&world=${WORLD}`,
      {
        timeout: 15000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
      }
    );

    console.log("✅ HTML recebido. Status:", response.status);
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

  if (!html) {
    console.log("❌ Nenhum HTML retornado.");
    return;
  }

  const $ = cheerio.load(html);

  const tables = $("table");
  console.log("🔎 Tabelas encontradas:", tables.length);

  if (tables.length === 0) {
    console.log("⚠ Nenhuma tabela encontrada.");
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  tables.each((i, table) => {
    const rows = $(table).find("tr");

    rows.each((j, row) => {
      const columns = $(row).find("td");

      if (columns.length >= 2) {
        const name = $(columns[0]).text().trim();
        const expText = $(columns[1]).text().replace(/\./g, "").trim();
        const exp = parseInt(expText);

        if (name && !isNaN(exp)) {
          db.run(
            "INSERT INTO players (name, exp, date) VALUES (?, ?, ?)",
            [name, exp, today]
          );
        }
      }
    });
  });

  console.log("✅ Processamento finalizado.");
}

// ===== CRON (10 em 10 minutos) =====
cron.schedule("*/10 * * * *", () => {
  console.log("⏳ Rodando atualização automática...");
  updateGuildData();
});

// ===== ROTA PRINCIPAL =====
app.get("/", async (req, res) => {
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
        res.send("Erro no banco.");
      } else {
        res.send(`
          <h1>Guild ${GUILD_NAME}</h1>
          <h2>XP Total Hoje</h2>
          <p>Players encontrados: ${rows.length}</p>
          <table border="1" cellpadding="5">
            <tr>
              <th>Player</th>
              <th>XP Hoje</th>
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
    }
  );
});

// ===== ROTA DEBUG =====
app.get("/debug", async (req, res) => {
  const html = await fetchGuildData();

  if (!html) {
    return res.send("Erro ao buscar HTML.");
  }

  res.send(`
    <h2>Debug HTML</h2>
    <p>Tamanho: ${html.length}</p>
    <pre style="white-space: pre-wrap; font-size:10px;">
      ${html.substring(0, 5000)}
    </pre>
  `);
});

// ===== START =====
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
