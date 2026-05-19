const { ethers } = require("ethers");
require("dotenv").config();

const MUSD_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const REGISTRY_ABI = [
  "function registerAgent(string agentId, string agentType) external",
  "function recordIntel(string batchId, string dataHash, uint32 itemCount, address scraperWallet) external",
  "function recordReport(string reportId, string dataHash, string action, uint8 confidence, address analysisWallet) external",
  "function recordTrade(string tradeId, string dataHash, string action, string asset) external",
  "function getIntelCount() view returns (uint256)",
  "function getReportCount() view returns (uint256)",
  "function getTradeCount() view returns (uint256)",
  "function dataPrice() view returns (uint256)",
  "function reportPrice() view returns (uint256)",
];

function getProvider() {
  return new ethers.JsonRpcProvider(
    process.env.MEZO_RPC_URL || "https://rpc.test.mezo.org"
  );
}

function getWallet(privateKey) {
  return new ethers.Wallet(privateKey, getProvider());
}

function getMUSD(wallet) {
  return new ethers.Contract(
    process.env.MUSD_TOKEN_ADDRESS,
    MUSD_ABI,
    wallet
  );
}

function getRegistry(wallet) {
  return new ethers.Contract(
    process.env.REGISTRY_CONTRACT_ADDRESS,
    REGISTRY_ABI,
    wallet
  );
}

async function getMUSDBalance(wallet) {
  const musd = getMUSD(wallet);
  const bal = await musd.balanceOf(wallet.address);
  return ethers.formatEther(bal);
}

async function approveMUSD(wallet, amount) {
  const musd = getMUSD(wallet);
  const tx = await musd.approve(
    process.env.REGISTRY_CONTRACT_ADDRESS,
    amount
  );
  await tx.wait();
  return tx.hash;
}

module.exports = {
  getProvider,
  getWallet,
  getMUSD,
  getRegistry,
  getMUSDBalance,
  approveMUSD,
};
