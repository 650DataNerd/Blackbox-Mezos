const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("Deploying to Mezo testnet...\n");

  // Deploy Mock MUSD for testing
  console.log("1. Deploying MockMUSD...");
  const MockMUSD = await ethers.getContractFactory("MockMUSD");
  const mockMUSD = await MockMUSD.deploy();
  await mockMUSD.waitForDeployment();
  const musdAddress = await mockMUSD.getAddress();
  console.log("   MockMUSD deployed to:", musdAddress);
  console.log("   Explorer:", `https://explorer.test.mezo.org/address/${musdAddress}`);

  // Deploy BlackBox Registry using MockMUSD
  console.log("\n2. Deploying BlackBoxRegistry...");
  const BlackBoxRegistry = await ethers.getContractFactory("BlackBoxRegistry");
  const registry = await BlackBoxRegistry.deploy(musdAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("   BlackBoxRegistry deployed to:", registryAddress);
  console.log("   Explorer:", `https://explorer.test.mezo.org/address/${registryAddress}`);

  // Mint MUSD to agent wallets
  console.log("\n3. Minting MUSD to agents...");
  const [deployer] = await ethers.getSigners();

  const agents = [
    { name: "SCRAPER",  key: process.env.SCRAPER_AGENT_PRIVATE_KEY,  amount: "5" },
    { name: "ANALYSIS", key: process.env.ANALYSIS_AGENT_PRIVATE_KEY, amount: "500" },
    { name: "TRADING",  key: process.env.TRADING_AGENT_PRIVATE_KEY,  amount: "500" },
  ];

  for (const agent of agents) {
    const wallet = new ethers.Wallet(agent.key);
    const amount = ethers.parseEther(agent.amount);
    const tx = await mockMUSD.mint(wallet.address, amount);
    await tx.wait();
    console.log(`   Minted ${agent.amount} MUSD to ${agent.name} (${wallet.address})`);
  }

  console.log("\n✅ Deployment complete!\n");
  console.log("Add these to your .env:");
  console.log(`MUSD_TOKEN_ADDRESS=${musdAddress}`);
  console.log(`REGISTRY_CONTRACT_ADDRESS=${registryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
