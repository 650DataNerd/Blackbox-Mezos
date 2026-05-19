require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cron = require("node-cron");
const { ethers } = require("ethers");
const { getWallet, getRegistry, getMUSDBalance, approveMUSD } = require("../../lib/mezo");
const { saveReport } = require("../../lib/db");
const { logger } = require("../../lib/logger");

const AGENT_ID = "analysis-v1";
const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(DATA_DIR, "reports");
const PROCESSED_FILE = path.join(DATA_DIR, ".processed.json");

if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const BULLISH = [
  "surge","rally","gain","high","bull","pump","rise","growth","adoption",
  "approve","launch","partnership","record","soar","bitcoin","crypto",
  "blockchain","defi","nft","web3","solana","ethereum","btc","eth",
  "breakout","ath","milestone","upgrade","mainnet","integration","funding",
  "investment","profit","win","success","positive","increase","up"
];

const BEARISH = [
  "crash","drop","fall","bear","dump","low","sell","ban","hack","breach",
  "lawsuit","fear","risk","warn","decline","plunge","scam","fraud","attack",
  "vulnerability","exploit","rug","ponzi","bubble","collapse","crisis",
  "regulation","crackdown","fine","arrest","loss","negative","decrease","down"
];

function scoreSentiment(text) {
  const lower = text.toLowerCase();
  const bull = BULLISH.filter(w => lower.includes(w)).length;
  const bear = BEARISH.filter(w => lower.includes(w)).length;
  return bull > bear ? "positive" : bear > bull ? "negative" : "neutral";
}

function loadProcessed() {
  if (!fs.existsSync(PROCESSED_FILE)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf-8")));
}

function markProcessed(f) {
  const p = loadProcessed(); p.add(f);
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...p], null, 2));
}

function hashData(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
}

function analyseItems(items) {
  const scored = items.map(i => ({ ...i, sentiment: scoreSentiment(i.title + " " + i.summary) }));
  const positive = scored.filter(i => i.sentiment === "positive").length;
  const negative = scored.filter(i => i.sentiment === "negative").length;
  const neutral = scored.filter(i => i.sentiment === "neutral").length;
  const total = items.length || 1;
  const sentimentScore = (positive - negative) / total;

  // More dynamic confidence based on signal strength
  const signalStrength = (positive + negative) / total;
  const confidence = Math.min(0.5 + signalStrength * 0.4 + Math.abs(sentimentScore) * 0.1, 0.95);

  const recommendedAction =
    sentimentScore > 0.15 ? "buy"
    : sentimentScore < -0.15 ? "sell"
    : sentimentScore > 0 ? "watch"
    : "hold";

  const riskLevel =
    negative / total > 0.4 ? "high"
    : negative / total > 0.2 ? "medium"
    : "low";

  const topSignals = scored
    .filter(i => i.sentiment !== "neutral")
    .slice(0, 3)
    .map(i => i.title.slice(0, 80));

  if (topSignals.length === 0) {
    scored.slice(0, 3).forEach(i => topSignals.push(i.title.slice(0, 80)));
  }

  const sources = [...new Set(items.map(i => i.source))].join(", ");

  return {
    id: `report-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    sourcesUsed: items.length,
    topSignals,
    riskLevel,
    recommendedAction,
    confidence: parseFloat(confidence.toFixed(2)),
    summary: `Analysed ${items.length} items across ${sources}. Sentiment: ${positive} bullish, ${negative} bearish, ${neutral} neutral. Signal leans ${recommendedAction.toUpperCase()} with ${riskLevel} risk and ${Math.round(confidence * 100)}% confidence.`,
  };
}

async function runAnalysisCycle(wallet) {
  logger.info("Starting analysis cycle", { agent: AGENT_ID });
  const processed = loadProcessed();
  const batchFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith("batch-") && f.endsWith(".json"))
    .filter(f => !processed.has(f));

  if (batchFiles.length === 0) { logger.info("No new batches", { agent: AGENT_ID }); return; }

  const scraperKey = process.env.SCRAPER_AGENT_PRIVATE_KEY;
  const scraperWallet = new ethers.Wallet(scraperKey);
  const registry = getRegistry(wallet);
  const dataPrice = await registry.dataPrice();

  for (const batchFile of batchFiles) {
    const items = JSON.parse(fs.readFileSync(path.join(DATA_DIR, batchFile), "utf-8"));
    logger.info(`Processing ${batchFile} (${items.length} items)`, { agent: AGENT_ID });

    try {
      await approveMUSD(wallet, dataPrice);
    } catch (err) {
      logger.warn("MUSD approval failed", { agent: AGENT_ID, error: err.message });
      continue;
    }

    const batchId = batchFile.replace(".json", "");
    let paidTx;
    try {
      const tx = await registry.recordIntel(batchId, hashData(items), items.length, scraperWallet.address);
      await tx.wait();
      paidTx = tx.hash;
      logger.info(`Paid Scraper 1 MUSD on-chain`, { agent: AGENT_ID, tx: paidTx, explorer: `https://explorer.test.mezo.org/tx/${paidTx}` });
    } catch (err) {
      logger.warn("On-chain payment failed", { agent: AGENT_ID, error: err.message });
    }

    const report = { ...analyseItems(items), paidTxHash: paidTx };
    fs.writeFileSync(path.join(REPORTS_DIR, `${report.id}.json`), JSON.stringify(report, null, 2));

    try {
      await saveReport(report);
      logger.info("Report saved to Supabase", { agent: AGENT_ID });
    } catch (err) {
      logger.warn("Supabase save failed", { agent: AGENT_ID, error: err.message });
    }

    logger.info(`Report generated`, { agent: AGENT_ID, action: report.recommendedAction, risk: report.riskLevel, confidence: report.confidence });
    markProcessed(batchFile);
  }
}

async function main() {
  logger.info("Analysis Agent starting on Mezo", { agent: AGENT_ID });
  const privateKey = process.env.ANALYSIS_AGENT_PRIVATE_KEY;
  if (!privateKey) throw new Error("ANALYSIS_AGENT_PRIVATE_KEY not set");
  const wallet = getWallet(privateKey);
  logger.info(`Wallet: ${wallet.address}`, { agent: AGENT_ID });
  await runAnalysisCycle(wallet);
  cron.schedule("5,20,35,50 * * * *", async () => { await runAnalysisCycle(wallet); });
  logger.info("Analysis Agent running", { agent: AGENT_ID });
}

main().catch(err => { logger.error("Analysis Agent crashed", { agent: AGENT_ID, error: err.message }); process.exit(1); });
