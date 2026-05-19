require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cron = require("node-cron");
const { ethers } = require("ethers");
const { getWallet, getRegistry, getMUSDBalance, approveMUSD } = require("../../lib/mezo");
const { saveTrade } = require("../../lib/db");
const { logger } = require("../../lib/logger");

const AGENT_ID = "trading-v1";
const REPORTS_DIR = path.join(process.cwd(), "data", "reports");
const TRADES_DIR = path.join(process.cwd(), "data", "trades");
const PROCESSED_FILE = path.join(process.cwd(), "data", ".trades-processed.json");

if (!fs.existsSync(TRADES_DIR)) fs.mkdirSync(TRADES_DIR, { recursive: true });

function loadProcessed() {
  if (!fs.existsSync(PROCESSED_FILE)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf-8")));
}

function markProcessed(id) {
  const p = loadProcessed(); p.add(id);
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...p], null, 2));
}

function hashData(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
}

function decideAction(report) {
  if (report.confidence < 0.5) return { action: "hold", asset: "BTC", note: `Confidence too low (${report.confidence}) — holding` };
  if (report.recommendedAction === "buy" && report.riskLevel !== "high") return { action: "buy", asset: "BTC", note: `Buy signal — ${report.riskLevel} risk` };
  if (report.recommendedAction === "sell") return { action: "sell", asset: "BTC", note: `Sell signal — risk: ${report.riskLevel}` };
  return { action: "hold", asset: "BTC", note: "No clear signal — holding" };
}

async function runTradingCycle(wallet) {
  logger.info("Starting trading cycle", { agent: AGENT_ID });
  if (!fs.existsSync(REPORTS_DIR)) { logger.info("No reports yet", { agent: AGENT_ID }); return; }

  const processed = loadProcessed();
  const reportFiles = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith(".json"))
    .filter(f => !processed.has(f.replace(".json", "")));

  if (reportFiles.length === 0) { logger.info("No new reports", { agent: AGENT_ID }); return; }

  const analysisKey = process.env.ANALYSIS_AGENT_PRIVATE_KEY;
  const analysisWallet = new ethers.Wallet(analysisKey);
  const registry = getRegistry(wallet);
  const reportPrice = await registry.reportPrice();

  for (const reportFile of reportFiles) {
    const report = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, reportFile), "utf-8"));
    logger.info(`Reading report ${report.id}`, { agent: AGENT_ID });

    let paymentTx;
    try {
      await approveMUSD(wallet, reportPrice);
      const tx = await registry.recordReport(report.id, hashData(report), report.recommendedAction, Math.round(report.confidence * 100), analysisWallet.address);
      await tx.wait();
      paymentTx = tx.hash;
      logger.info(`Paid Analysis 2 MUSD on-chain`, { agent: AGENT_ID, tx: paymentTx, explorer: `https://explorer.test.mezo.org/tx/${paymentTx}` });
    } catch (err) {
      logger.warn("On-chain payment failed", { agent: AGENT_ID, error: err.message });
    }

    const decision = decideAction(report);
    const trade = {
      id: `trade-${Date.now()}`,
      executedAt: new Date().toISOString(),
      action: decision.action,
      asset: decision.asset,
      basedOnReportId: report.id,
      txHash: paymentTx,
      status: "simulated",
      note: decision.note,
    };

    try {
      const tx = await registry.recordTrade(trade.id, hashData(trade), trade.action, trade.asset);
      await tx.wait();
      logger.info(`Trade recorded on-chain`, { agent: AGENT_ID, tx: tx.hash, explorer: `https://explorer.test.mezo.org/tx/${tx.hash}` });
    } catch (err) {
      logger.warn("Trade recording failed", { agent: AGENT_ID, error: err.message });
    }

    fs.writeFileSync(path.join(TRADES_DIR, `${trade.id}.json`), JSON.stringify(trade, null, 2));

    try {
      await saveTrade(trade);
      logger.info("Trade saved to Supabase", { agent: AGENT_ID });
    } catch (err) {
      logger.warn("Supabase save failed", { agent: AGENT_ID, error: err.message });
    }

    logger.info(`Trade executed`, { agent: AGENT_ID, action: trade.action, asset: trade.asset, note: trade.note });
    markProcessed(report.id);
  }
}

async function main() {
  logger.info("Trading Agent starting on Mezo", { agent: AGENT_ID });
  const privateKey = process.env.TRADING_AGENT_PRIVATE_KEY;
  if (!privateKey) throw new Error("TRADING_AGENT_PRIVATE_KEY not set");
  const wallet = getWallet(privateKey);
  logger.info(`Wallet: ${wallet.address}`, { agent: AGENT_ID });
  await runTradingCycle(wallet);
  cron.schedule("10,25,40,55 * * * *", async () => { await runTradingCycle(wallet); });
  logger.info("Trading Agent running", { agent: AGENT_ID });
}

main().catch(err => { logger.error("Trading Agent crashed", { agent: AGENT_ID, error: err.message }); process.exit(1); });
