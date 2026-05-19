require("dotenv").config();
const { ethers } = require("ethers");

const MUSD_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.test.mezo.org");
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const musd = new ethers.Contract(process.env.MUSD_TOKEN_ADDRESS, MUSD_ABI, deployer);

  const bal = await musd.balanceOf(deployer.address);
  console.log("Deployer MUSD balance:", ethers.formatEther(bal));

  const agents = [
    { name: "SCRAPER",  key: process.env.SCRAPER_AGENT_PRIVATE_KEY,  amount: "5" },
    { name: "ANALYSIS", key: process.env.ANALYSIS_AGENT_PRIVATE_KEY, amount: "50" },
    { name: "TRADING",  key: process.env.TRADING_AGENT_PRIVATE_KEY,  amount: "50" },
  ];

  for (const agent of agents) {
    const wallet = new ethers.Wallet(agent.key);
    const amount = ethers.parseEther(agent.amount);
    console.log(`Sending ${agent.amount} MUSD to ${agent.name} (${wallet.address})...`);
    const tx = await musd.transfer(wallet.address, amount);
    await tx.wait();
    console.log(`✅ ${agent.name} funded — tx: ${tx.hash}`);
  }

  console.log("\nAll agents funded!");
}

main().catch(console.error);
