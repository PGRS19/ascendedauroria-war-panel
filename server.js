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

// ===== PEGAR MEMBROS =====
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

    console.log("👥 Membros:", members.length);
    return members;
  } catch (err) {
    console.error("Erro guild:", err.message);
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
        const points = parseInt(
          $(cols
