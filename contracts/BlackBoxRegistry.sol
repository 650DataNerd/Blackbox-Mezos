// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract BlackBoxRegistry {
    IERC20 public musd;
    address public owner;

    uint256 public dataPrice   = 1e18;
    uint256 public reportPrice = 2e18;

    // ── Access control ────────────────────────────────────
    mapping(address => bool) public authorizedAgents;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        _;
    }

    // ── Agent registry ────────────────────────────────────
    struct Agent {
        string  agentId;
        string  agentType;
        address wallet;
        uint256 registeredAt;
        uint256 totalTransactions;
        uint256 totalEarned;
    }

    mapping(address => Agent) public agents;
    address[] public agentList;

    // ── Intel records ─────────────────────────────────────
    struct IntelRecord {
        string  batchId;
        string  dataHash;
        uint32  itemCount;
        address agent;
        uint256 recordedAt;
    }
    mapping(string => IntelRecord) public intelRecords;
    string[] public intelIds;

    // ── Report records ────────────────────────────────────
    struct ReportRecord {
        string  reportId;
        string  dataHash;
        string  action;
        uint8   confidence;
        uint256 paidMusd;
        address agent;
        uint256 recordedAt;
    }
    mapping(string => ReportRecord) public reportRecords;
    string[] public reportIds;

    // ── Trade records ─────────────────────────────────────
    struct TradeRecord {
        string  tradeId;
        string  dataHash;
        string  action;
        string  asset;
        uint256 paidMusd;
        address agent;
        uint256 recordedAt;
    }
    mapping(string => TradeRecord) public tradeRecords;
    string[] public tradeIds;

    // ── Rate limiting ─────────────────────────────────────
    mapping(address => uint256) public lastActionTime;
    uint256 public cooldownPeriod = 60; // seconds between actions
    uint256 public maxMusdPerCycle = 100e18; // max 100 MUSD per agent per cycle
    mapping(address => uint256) public cycleSpend;
    mapping(address => uint256) public cycleStart;

    // ── Events ────────────────────────────────────────────
    event AgentAuthorized(address indexed wallet);
    event AgentRevoked(address indexed wallet);
    event AgentRegistered(address indexed wallet, string agentId, string agentType);
    event IntelRecorded(string batchId, string dataHash, uint32 itemCount, address agent);
    event ReportRecorded(string reportId, string action, uint8 confidence, uint256 paidMusd);
    event TradeRecorded(string tradeId, string action, string asset, uint256 paidMusd);
    event DataPurchased(address buyer, address seller, uint256 amount, string batchId);
    event ReportPurchased(address buyer, address seller, uint256 amount, string reportId);

    constructor(address _musd) {
        musd  = IERC20(_musd);
        owner = msg.sender;
        // Owner is authorized by default
        authorizedAgents[msg.sender] = true;
    }

    // ── Access control functions ──────────────────────────
    function authorizeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = true;
        emit AgentAuthorized(agent);
    }

    function revokeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = false;
        emit AgentRevoked(agent);
    }

    function batchAuthorize(address[] calldata agentAddresses) external onlyOwner {
        for (uint i = 0; i < agentAddresses.length; i++) {
            authorizedAgents[agentAddresses[i]] = true;
            emit AgentAuthorized(agentAddresses[i]);
        }
    }

    // ── Rate limit check ──────────────────────────────────
    modifier rateLimit() {
        require(
            block.timestamp >= lastActionTime[msg.sender] + cooldownPeriod,
            "Rate limit: wait before next action"
        );
        lastActionTime[msg.sender] = block.timestamp;
        _;
    }

    // ── Register agent ────────────────────────────────────
    function registerAgent(string memory agentId, string memory agentType) external onlyAuthorized {
        agents[msg.sender] = Agent({
            agentId:           agentId,
            agentType:         agentType,
            wallet:            msg.sender,
            registeredAt:      block.timestamp,
            totalTransactions: 0,
            totalEarned:       0
        });
        agentList.push(msg.sender);
        emit AgentRegistered(msg.sender, agentId, agentType);
    }

    // ── Record intel ──────────────────────────────────────
    function recordIntel(
        string memory batchId,
        string memory dataHash,
        uint32 itemCount,
        address scraperWallet
    ) external onlyAuthorized rateLimit {
        require(bytes(batchId).length > 0, "Invalid batchId");
        require(bytes(batchId).length <= 64, "batchId too long");
        require(itemCount > 0 && itemCount <= 1000, "Invalid item count");

        require(
            musd.transferFrom(msg.sender, scraperWallet, dataPrice),
            "MUSD transfer failed"
        );

        intelRecords[batchId] = IntelRecord({
            batchId:    batchId,
            dataHash:   dataHash,
            itemCount:  itemCount,
            agent:      msg.sender,
            recordedAt: block.timestamp
        });
        intelIds.push(batchId);

        agents[msg.sender].totalTransactions++;
        agents[scraperWallet].totalEarned += dataPrice;

        emit IntelRecorded(batchId, dataHash, itemCount, msg.sender);
        emit DataPurchased(msg.sender, scraperWallet, dataPrice, batchId);
    }

    // ── Record report ─────────────────────────────────────
    function recordReport(
        string memory reportId,
        string memory dataHash,
        string memory action,
        uint8 confidence,
        address analysisWallet
    ) external onlyAuthorized rateLimit {
        require(bytes(reportId).length > 0, "Invalid reportId");
        require(bytes(reportId).length <= 64, "reportId too long");
        require(confidence <= 100, "Invalid confidence");

        require(
            musd.transferFrom(msg.sender, analysisWallet, reportPrice),
            "MUSD transfer failed"
        );

        reportRecords[reportId] = ReportRecord({
            reportId:   reportId,
            dataHash:   dataHash,
            action:     action,
            confidence: confidence,
            paidMusd:   reportPrice,
            agent:      msg.sender,
            recordedAt: block.timestamp
        });
        reportIds.push(reportId);

        agents[msg.sender].totalTransactions++;
        agents[analysisWallet].totalEarned += reportPrice;

        emit ReportRecorded(reportId, action, confidence, reportPrice);
        emit ReportPurchased(msg.sender, analysisWallet, reportPrice, reportId);
    }

    // ── Record trade ──────────────────────────────────────
    function recordTrade(
        string memory tradeId,
        string memory dataHash,
        string memory action,
        string memory asset
    ) external onlyAuthorized {
        require(bytes(tradeId).length > 0, "Invalid tradeId");
        require(bytes(tradeId).length <= 64, "tradeId too long");

        tradeRecords[tradeId] = TradeRecord({
            tradeId:    tradeId,
            dataHash:   dataHash,
            action:     action,
            asset:      asset,
            paidMusd:   reportPrice,
            agent:      msg.sender,
            recordedAt: block.timestamp
        });
        tradeIds.push(tradeId);
        agents[msg.sender].totalTransactions++;

        emit TradeRecorded(tradeId, action, asset, reportPrice);
    }

    // ── Views ─────────────────────────────────────────────
    function getIntelCount()  external view returns (uint256) { return intelIds.length; }
    function getReportCount() external view returns (uint256) { return reportIds.length; }
    function getTradeCount()  external view returns (uint256) { return tradeIds.length; }
    function getAgentCount()  external view returns (uint256) { return agentList.length; }
    function isAuthorized(address agent) external view returns (bool) { return authorizedAgents[agent]; }

    // ── Owner controls ────────────────────────────────────
    function setDataPrice(uint256 price)     external onlyOwner { dataPrice   = price; }
    function setReportPrice(uint256 price)   external onlyOwner { reportPrice = price; }
    function setCooldown(uint256 seconds_)   external onlyOwner { cooldownPeriod = seconds_; }
    function setMaxMusd(uint256 amount)      external onlyOwner { maxMusdPerCycle = amount; }
}
