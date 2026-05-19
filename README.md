# ⬛ Black Box — Mezo Edition
### Autonomous Geopolitical Intelligence Syndicate on Bitcoin

> Three autonomous AI agents that scrape global intelligence, pay each other in MUSD (Bitcoin-backed stablecoin), and execute trading decisions — fully on-chain, zero human input.

[![Network: Mezo Testnet](https://img.shields.io/badge/Network-Mezo%20Testnet-orange)](https://explorer.test.mezo.org)
[![License: BSL-1.1](https://img.shields.io/badge/License-BSL--1.1-blue)](https://mariadb.com/bsl11/)

---

## What is Black Box?

Black Box is the first autonomous AI agent economy built on Mezo. Three specialized agents operate in a closed loop — scraping real-world intelligence, buying and selling data using MUSD, and executing Bitcoin-native trading decisions. No human approves anything. Ever.Global Data              Intelligence            BTC Trading
───────────              ────────────            ───────────
News APIs    ──►   Scraper Agent
Crypto feeds              │ earns MUSD
HackerNews                ▼
Analysis Agent  ──►   Intelligence Report
│ earns MUSD
▼
Trading Agent  ──►  On-chain DecisionEvery payment between agents is a real MUSD transfer recorded on Mezo testnet.

---

## Live Contracts (Mezo Testnet)

| Contract | Address |
|----------|---------|
| BlackBox Registry | `0xD5dd525648A0ca3ee3d093dcCF6B64E55cBF396C` |
| MUSD Token | `0xa75a13a000B8fE1C4a05F8FA538FF6bAafbDf08B` |

View on [Mezo Explorer](https://explorer.test.mezo.org/address/0xD5dd525648A0ca3ee3d093dcCF6B64E55cBF396C)

---

## Live Transactions

Real MUSD payments between agents, verifiable on-chain:

- Analysis → Scraper: [0xc9565c...](https://explorer.test.mezo.org/tx/0xc9565c4e884dca14aca4dc274942d0418a75d555cb895923cb2fc672980c024b)
- Trading → Analysis: [0xdf0ecc...](https://explorer.test.mezo.org/tx/0xdf0ecc0dadfa325059963aa6cd81bb943d8dce666dec65cf2cf29a87ad463027)
- Trade recorded: [0x43d461...](https://explorer.test.mezo.org/tx/0x43d4615309a5cb9434a836105a005be6422d92309222d2bebf1ce91a61f722dc)

---

## Quickstart

### Prerequisites
- Node.js 22+
- A wallet with Mezo testnet BTC (from [faucet.test.mezo.org](https://faucet.test.mezo.org))

### 1. Install
```bash
git clone https://github.com/650DataNerd/Blackbox-Mezos
cd Blackbox-Mezos
npm install
```

### 2. Configure
```bash
cp .env.example .env
# Fill in your private keys and contract addresses
```

### 3. Run the swarm
Open three terminals:
```bash
npm run scraper    # Terminal 1 — harvests intel every 15 min
npm run analysis   # Terminal 2 — buys data, generates reports
npm run trading    # Terminal 3 — buys reports, executes decisions
```

---

## Architecture

| Agent | Role | Pays | Earns |
|-------|------|------|-------|
| Scraper | Harvests news & crypto signals | — | MUSD from Analysis |
| Analysis | Buys data, generates intel reports | 1 MUSD to Scraper | MUSD from Trading |
| Trading | Buys reports, executes decisions | 2 MUSD to Analysis | — |

All payments use MUSD — Bitcoin's native stablecoin on Mezo.

---

## Why Mezo?

Bitcoin has always been a store of value. Mezo makes it productive. By settling agent-to-agent payments in MUSD — a 100% Bitcoin-backed stablecoin — Black Box demonstrates that autonomous AI economies can be built on Bitcoin's financial layer. No bridges. No wrapped tokens. Just Bitcoin-native programmable money powering a self-sustaining intelligence marketplace.

---

## Roadmap

- [x] 3 autonomous agents scraping real intelligence
- [x] MUSD payments between agents on Mezo testnet
- [x] Solidity registry contract deployed on-chain
- [x] All agent actions recorded on Mezo Explorer
- [ ] Claude AI integration for intelligent analysis
- [ ] Live dashboard deployed publicly
- [ ] MUSD savings vault integration
- [ ] Multi-agent marketplace (open to third-party agents)

---

## Built With

- Mezo (EVM-compatible Bitcoin chain)
- MUSD (Bitcoin-backed stablecoin)
- Solidity / Hardhat
- Node.js / Ethers.js
- HackerNews API / CryptoCompare API

---

## License

BSL-1.1 — Free for non-commercial use.
