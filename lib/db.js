const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  { realtime: { transport: ws } }
);

async function saveIntelItems(items) {
  const rows = items.map(i => ({
    id: i.id,
    source: i.source,
    title: i.title,
    summary: i.summary,
    url: i.url,
    published_at: i.publishedAt,
    tags: i.tags,
    sentiment: i.sentiment,
    fetched_at: i.fetchedAt,
  }));
  const { error } = await supabase.from("intel_batches").upsert(rows, { onConflict: "id" });
  if (error) throw new Error("Intel save failed: " + error.message);
}

async function saveReport(report) {
  const { error } = await supabase.from("reports").upsert({
    id: report.id,
    generated_at: report.generatedAt,
    sources_used: report.sourcesUsed,
    top_signals: report.topSignals,
    risk_level: report.riskLevel,
    recommended_action: report.recommendedAction,
    confidence: report.confidence,
    summary: report.summary,
    paid_tx_signature: report.paidTxHash ?? null,
  }, { onConflict: "id" });
  if (error) throw new Error("Report save failed: " + error.message);
}

async function saveTrade(trade) {
  const { error } = await supabase.from("trades").upsert({
    id: trade.id,
    executed_at: trade.executedAt,
    action: trade.action,
    asset: trade.asset,
    based_on_report_id: trade.basedOnReportId,
    tx_signature: trade.txHash ?? null,
    status: trade.status,
    note: trade.note ?? null,
  }, { onConflict: "id" });
  if (error) throw new Error("Trade save failed: " + error.message);
}

module.exports = { saveIntelItems, saveReport, saveTrade };
