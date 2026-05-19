require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const REGISTRY = process.env.REGISTRY_CONTRACT_ADDRESS;
  const ABI = ["function setCooldown(uint256 seconds_) external"];
  const [deployer] = await ethers.getSigners();
  const registry = new ethers.Contract(REGISTRY, ABI, deployer);
  const tx = await registry.setCooldown(10);
  await tx.wait();
  console.log("✅ Cooldown set to 10 seconds — tx:", tx.hash);
}

main().catch(console.error);
