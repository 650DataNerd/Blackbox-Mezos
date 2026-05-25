require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { getWallet, getMUSDBalance } = require("../../lib/mezo");
const { saveIntelItems } = require("../../lib/db");
const { logger } = require("../../lib/logger");

const AGENT_ID = "scraper-v1";
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function fetchHackerNews() {
  try {
    const topRes = await axios.get("https://hacker-news.firebaseio.com/v0/topstories.json", { timeout: 8000 });
    const ids = topRes.data.slice(0, 6);
    const items = await Promise.all(
      ids.map(id => axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 }).then(r => r.data).catch(() => null))
    );
    return items.filter(i => i && i.title).map(i => ({
      id: crypto.randomUUID(),
      source: "hackernews",
      title: i.title,
      summary: i.title,
      url: i.url || `https://news.ycombinator.com/item?id=${i.id}`,
      publishedAt: new Date(i.time * 1000).toISOString(),
      tags: ["tech"],
      sentiment: "neutral",
      fetchedAt: new Date().toISOString(),
    }));
  } catch (err) {
    logger.warn("HackerNews fetch failed", { agent: AGENT_ID, error: err.message });
    return [];
  }
}

async function fetchCoinDeskRSS() {
  try {
    const res = await axios.get("https://www.coindesk.com/arc/outboundfeeds/rss/", {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const items = [];
    const matches = [...res.data.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)];
    const links = [...res.data.matchAll(/<link>(https?:\/\/www\.coindesk\.com[^<]+)<\/link>/g)];
    matches.slice(0, 8).forEach((match, idx) => {
      const title = match[1].trim();
      if (title && !title.includes("CoinDesk")) {
        items.push({
          id: crypto.randomUUID(),
          source: "coindesk",
          title,
          summary: title,
          url: links[idx]?.[1] || "https://coindesk.com",
          publishedAt: new Date().toISOString(),
          tags: ["crypto", "bitcoin"],
          sentiment: "neutral",
          fetchedAt: new Date().toISOString(),
        });
      }
    });
    return items;
  } catch (err) {
    logger.warn("CoinDesk fetch failed", { agent: AGENT_ID, error: err.message });
    return [];
  }
}

async function fetchNewsAPI() {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];
  try {
    const queries = ["bitcoin", "cryptocurrency market", "geopolitical economy"];
    const query = queries[Math.floor(Math.random() * queries.length)];
    const res = await axios.get(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=8&language=en&apiKey=${key}`,
      { timeout: 8000 }
    );
    const articles = res.data?.articles ?? [];
    return articles.filter(a => a.title && a.title !== "[Removed]").map(a => ({
      id: crypto.randomUUID(),
      source: "newsapi:" + (a.source?.name || "unknown"),
      title: a.title,
      summary: a.description || a.title,
      url: a.url,
      publishedAt: a.publishedAt,
      tags: ["news", query],
      sentiment: "neutral",
      fetchedAt: new Date().toISOString(),
    }));
  } catch (err) {
    logger.warn("NewsAPI fetch failed", { agent: AGENT_ID, error: err.message });
    return [];
  }
}

async function runScrapeCycle(wallet) {
  logger.info("Starting scrape cycle", { agent: AGENT_ID });
  const [hnItems, cdItems, naItems] = await Promise.all([
    fetchHackerNews(),
    fetchCoinDeskRSS(),
    fetchNewsAPI(),
  ]);

  const allItems = [...hnItems, ...cdItems, ...naItems];

  if (allItems.length === 0) {
    logger.warn("No items fetched", { agent: AGENT_ID });
    return;
  }

  const batchId = `batch-${Date.now()}`;
  fs.writeFileSync(path.join(DATA_DIR, `${batchId}.json`), JSON.stringify(allItems, null, 2));

  try {
    await saveIntelItems(allItems);
    logger.info(`Saved ${allItems.length} items to Supabase`, {
      agent: AGENT_ID,
      sources: [...new Set(allItems.map(i => i.source.split(":")[0]))].join(", "),
    });
  } catch (err) {
    logger.warn("Supabase save failed", { agent: AGENT_ID, error: err.message });
  }

  logger.info(`Cycle complete — ${batchId}`, { agent: AGENT_ID });
}

async function main() {
  logger.info("Scraper Agent starting on Mezo", { agent: AGENT_ID });
  const privateKey = process.env.SCRAPER_AGENT_PRIVATE_KEY;
  if (!privateKey) throw new Error("SCRAPER_AGENT_PRIVATE_KEY not set");
  const wallet = getWallet(privateKey);
  logger.info(`Wallet: ${wallet.address}`, { agent: AGENT_ID });
  const musdBal = await getMUSDBalance(wallet);
  logger.info(`MUSD balance: ${musdBal}`, { agent: AGENT_ID });
  await runScrapeCycle(wallet);
  cron.schedule("*/15 * * * *", async () => { await runScrapeCycle(wallet); });
  logger.info("Scraper running — fetching every 15 minutes", { agent: AGENT_ID });
}

main().catch(err => {
  logger.error("Scraper crashed", { agent: AGENT_ID, error: err.message });
  process.exit(1);
});
