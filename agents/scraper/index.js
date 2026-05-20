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
    const ids = topRes.data.slice(0, 8);
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
    const matches = res.data.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g);
    const links = res.data.matchAll(/<link>(.*?)<\/link>/g);
    const linkArr = [...links].map(m => m[1]).filter(l => l.includes("coindesk.com"));
    let idx = 0;
    for (const match of matches) {
      const title = (match[1] || match[2] || "").trim();
      if (title && !title.includes("CoinDesk") && idx < 8) {
        items.push({
          id: crypto.randomUUID(),
          source: "coindesk",
          title,
          summary: title,
          url: linkArr[idx] || "https://coindesk.com",
          publishedAt: new Date().toISOString(),
          tags: ["crypto", "bitcoin"],
          sentiment: "neutral",
          fetchedAt: new Date().toISOString(),
        });
        idx++;
      }
    }
    return items;
  } catch (err) {
    logger.warn("CoinDesk fetch failed", { agent: AGENT_ID, error: err.message });
    return [];
  }
}

async function fetchCryptoPanicFree() {
  try {
    const res = await axios.get(
      "https://cryptopanic.com/api/free/v1/posts/?auth_token=free&kind=news&filter=hot",
      { timeout: 8000 }
    );
    const results = res.data?.results ?? [];
    return results.slice(0, 8).map(item => ({
      id: crypto.randomUUID(),
      source: "cryptopanic",
      title: item.title,
      summary: item.title,
      url: item.url || "https://cryptopanic.com",
      publishedAt: item.published_at || new Date().toISOString(),
      tags: item.currencies?.map(c => c.code) ?? ["crypto"],
      sentiment: item.votes?.positive > item.votes?.negative ? "positive" 
               : item.votes?.negative > item.votes?.positive ? "negative" 
               : "neutral",
      fetchedAt: new Date().toISOString(),
    }));
  } catch (err) {
    logger.warn("CryptoPanic fetch failed", { agent: AGENT_ID, error: err.message });
    return [];
  }
}

async function fetchBitcoinMagazineRSS() {
  try {
    const res = await axios.get("https://bitcoinmagazine.com/.rss/full/", {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const items = [];
    const matches = res.data.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
    let idx = 0;
    for (const match of matches) {
      const title = match[1].trim();
      if (title && idx < 6) {
        items.push({
          id: crypto.randomUUID(),
          source: "bitcoinmagazine",
          title,
          summary: title,
          url: "https://bitcoinmagazine.com",
          publishedAt: new Date().toISOString(),
          tags: ["bitcoin", "crypto"],
          sentiment: "neutral",
          fetchedAt: new Date().toISOString(),
        });
        idx++;
      }
    }
    return items;
  } catch (err) {
    logger.warn("Bitcoin Magazine fetch failed", { agent: AGENT_ID, error: err.message });
    return [];
  }
}

async function runScrapeCycle(wallet) {
  logger.info("Starting scrape cycle", { agent: AGENT_ID });
  const [hnItems, cdItems, cpItems, bmItems] = await Promise.all([
    fetchHackerNews(),
    fetchCoinDeskRSS(),
    fetchCryptoPanicFree(),
    fetchBitcoinMagazineRSS(),
  ]);

  const allItems = [...hnItems, ...cdItems, ...cpItems, ...bmItems];

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
      sources: [...new Set(allItems.map(i => i.source))].join(", "),
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
