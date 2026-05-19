require("dotenv").config();
const { ethers } = require("ethers");

const BORROWER_OPS_ADDRESS = "0x74f9d88288F46E80B5E94d3e3DB7c5A4e40A93B9";
const TROVE_MANAGER_ADDRESS = "0x8B31d4834B15B527a5E9b45cA82cF8b71e97c451";
const SORTED_TROVES_ADDRESS = "0x2880aB155794e7179c9eE2e38200202908C17B43";
const HINT_HELPERS_ADDRESS  = "0xA45c3F94A6020ECe0Ff03b2AbD1d9F8E30D12d1b";

const BORROWER_OPS_ABI = [
  "function openTrove(uint256 _MUSDAmount, address _upperHint, address _lowerHint) external payable",
  "function getBorrowingFee(uint256 _MUSDAmount) external view returns (uint256)",
];

const TROVE_MANAGER_ABI = [
  "function MUSD_GAS_COMPENSATION() external view returns (uint256)",
];

const SORTED_TROVES_ABI = [
  "function findInsertPosition(uint256 _NICR, address _prevId, address _nextId) external view returns (address, address)",
];

const HINT_HELPERS_ABI = [
  "function getApproxHint(uint256 _CR, uint256 _numTrials, uint256 _inputRandomSeed) external view returns (address, uint256, uint256)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.test.mezo.org");
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

  console.log("Wallet:", wallet.address);
  const btcBal = await provider.getBalance(wallet.address);
  console.log("BTC balance:", ethers.formatEther(btcBal));

  const borrowerOps = new ethers.Contract(BORROWER_OPS_ADDRESS, BORROWER_OPS_ABI, wallet);
  const troveManager = new ethers.Contract(TROVE_MANAGER_ADDRESS, TROVE_MANAGER_ABI, wallet);
  const sortedTroves = new ethers.Contract(SORTED_TROVES_ADDRESS, SORTED_TROVES_ABI, wallet);
  const hintHelpers = new ethers.Contract(HINT_HELPERS_ADDRESS, HINT_HELPERS_ABI, wallet);

  const collateral = ethers.parseEther("0.03");   // 0.03 BTC collateral
  const debtAmount = ethers.parseEther("2000");    // 2000 MUSD

  console.log("Getting trove hints...");
  const gasComp = await troveManager.MUSD_GAS_COMPENSATION();
  const fee = await borrowerOps.getBorrowingFee(debtAmount);
  const totalDebt = debtAmount + fee + gasComp;
  const nicr = (collateral * BigInt(1e20)) / totalDebt;

  const [approxHint] = await hintHelpers.getApproxHint(nicr, 15, 42);
  const [upperHint, lowerHint] = await sortedTroves.findInsertPosition(nicr, approxHint, approxHint);

  console.log("Opening trove to mint 2000 MUSD...");
  const tx = await borrowerOps.openTrove(debtAmount, upperHint, lowerHint, {
    value: collateral,
  });
  await tx.wait();
  console.log("✅ Trove opened! tx:", tx.hash);
  console.log("Explorer:", `https://explorer.test.mezo.org/tx/${tx.hash}`);
  console.log("You now have ~2000 MUSD in your wallet!");
}

main().catch(console.error);
