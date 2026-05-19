require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const REGISTRY = process.env.REGISTRY_CONTRACT_ADDRESS;
  const ABI = [
    "function batchAuthorize(address[] calldata agents) external",
    "function isAuthorized(address agent) external view returns (bool)",
  ];

  const [deployer] = await ethers.getSigners();
  const registry = new ethers.Contract(REGISTRY, ABI, deployer);

  const agents = [
    process.env.SCRAPER_AGENT_PRIVATE_KEY,
    process.env.ANALYSIS_AGENT_PRIVATE_KEY,
    process.env.TRADING_AGENT_PRIVATE_KEY,
  ].map(key => new ethers.Wallet(key).address);

  console.log("Authorizing agents:");
  agents.forEach(a => console.log(" -", a));

  const tx = await registry.batchAuthorize(agents);
  await tx.wait();
  console.log("✅ All agents authorized — tx:", tx.hash);

  // Verify
  for (const agent of agents) {
    const auth = await registry.isAuthorized(agent);
    console.log(agent.slice(0,12) + "... authorized:", auth);
  }
}

main().catch(console.error);
