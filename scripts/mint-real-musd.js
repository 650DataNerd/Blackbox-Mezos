require("dotenv").config();
const { ethers } = require("hardhat");

const BORROWER_OPS = "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5";

const BORROW_OPS_ABI = [
  "function openTrove(uint256 _maxFeePercentage, uint256 _MUSDAmount, address _upperHint, address _lowerHint) external payable",
  "function MIN_NET_DEBT() external view returns (uint256)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Wallet:", deployer.address);

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("BTC balance:", ethers.formatEther(bal));

  const borrowerOps = new ethers.Contract(BORROWER_OPS, BORROW_OPS_ABI, deployer);

  try {
    const minDebt = await borrowerOps.MIN_NET_DEBT();
    console.log("Min net debt:", ethers.formatEther(minDebt), "MUSD");
  } catch(e) {
    console.log("Could not fetch min debt:", e.message);
  }

  // Try with more collateral — 0.04 BTC and 1800 MUSD (minimum)
  const collateral = ethers.parseEther("0.04");
  const musdAmount = ethers.parseEther("1800");
  const maxFee = ethers.parseEther("0.05");

  console.log("Opening trove with 0.04 BTC collateral, 1800 MUSD...");
  const tx = await borrowerOps.openTrove(
    maxFee,
    musdAmount,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    { value: collateral, gasLimit: 500000 }
  );
  await tx.wait();
  console.log("✅ Real MUSD minted! tx:", tx.hash);
  console.log("Explorer:", `https://explorer.test.mezo.org/tx/${tx.hash}`);
}

main().catch(console.error);
