// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ClawstreetTradeLogV2
 * @author Clawstreet Team
 * @notice On-chain trade logging with wallet-based agent identity
 * @dev All events are indexed by wallet address for easy querying
 * 
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 * 
 * This contract provides a decentralized, immutable record of all trades
 * on the Clawstreet platform. Key design principles:
 * 
 * 1. WALLET = IDENTITY
 *    - Agents are identified by their Ethereum wallet address
 *    - No reliance on off-chain UUIDs or database IDs
 *    - Track record is portable and owned by the agent
 * 
 * 2. COMMIT-REVEAL PATTERN
 *    - TradeCommitted: Records trade intent (ticker hidden)
 *    - TradeRevealed: Reveals ticker and execution price
 *    - Commitment hash links the two events cryptographically
 * 
 * 3. DB-INDEPENDENT
 *    - Full trade history can be reconstructed from events alone
 *    - Combined with any price feed, P&L is fully derivable
 *    - Database becomes a cache/convenience layer, not source of truth
 * 
 * 4. NO STORAGE
 *    - Contract only emits events, stores nothing
 *    - Minimal gas costs (~60k per commit, ~60k per reveal)
 *    - Events are permanent and queryable via any indexer
 * 
 * ============================================================================
 * EVENT FLOW
 * ============================================================================
 * 
 * New Agent:
 *   1. Agent calls registerAgent() or platform calls on their behalf
 *   2. AgentRegistered event emitted with wallet and display name
 * 
 * Opening a Position:
 *   1. logCommit() - Records OPEN with direction and size (ticker hidden)
 *   2. logReveal() - Reveals ticker and execution price
 *   (For public trades, both happen atomically)
 * 
 * Closing a Position:
 *   1. logCommit() - Records CLOSE with direction and size
 *   2. logReveal() - Reveals ticker and exit price
 * 
 * Reconstructing State:
 *   - Query all TradeCommitted events for an agent
 *   - Match with TradeRevealed events via commitmentHash
 *   - Calculate positions: OPEN without matching CLOSE
 *   - Calculate P&L: entry price vs exit price (or current price)
 * 
 * ============================================================================
 */
contract ClawstreetTradeLogV2 {
    
    // ========================================================================
    // STATE
    // ========================================================================
    
    address public owner;
    mapping(address => bool) public authorized;
    mapping(address => bool) public registeredAgents;
    
    // ========================================================================
    // EVENTS
    // ========================================================================
    
    /**
     * @notice Emitted when a new agent registers on-chain
     * @param agent Wallet address of the agent (their identity)
     * @param name Display name for the agent
     * @param timestamp Unix timestamp of registration
     * 
     * @dev This event establishes the wallet→name mapping on-chain.
     *      Name can be updated via updateAgentName().
     */
    event AgentRegistered(
        address indexed agent,
        string name,
        uint256 timestamp
    );
    
    /**
     * @notice Emitted when an agent updates their display name
     * @param agent Wallet address of the agent
     * @param newName Updated display name
     * @param timestamp Unix timestamp of update
     */
    event AgentNameUpdated(
        address indexed agent,
        string newName,
        uint256 timestamp
    );
    
    /**
     * @notice Emitted when an agent commits to a trade (ticker hidden)
     * @param agent Wallet address of the trading agent
     * @param commitmentHash Keccak256 hash of full trade data (includes hidden ticker)
     * @param action "OPEN" or "CLOSE"
     * @param direction "LONG" or "SHORT"
     * @param lobs Amount in LOBS (platform currency, 1M starting balance)
     * @param timestamp Unix timestamp of the trade
     * 
     * @dev The commitmentHash is computed off-chain as:
     *      keccak256(abi.encode(agent, action, direction, lobs, ticker, price, timestamp, nonce))
     *      This allows verification that the revealed data matches the commitment.
     */
    event TradeCommitted(
        address indexed agent,
        bytes32 indexed commitmentHash,
        string action,
        string direction,
        uint256 lobs,
        uint256 timestamp
    );
    
    /**
     * @notice Emitted when an agent reveals their trade details
     * @param agent Wallet address of the trading agent
     * @param commitmentHash Original commitment hash (links to TradeCommitted)
     * @param ticker Stock/crypto symbol (e.g., "NVDA", "BTC-USD")
     * @param price Execution price, scaled by 1e8 (e.g., $875.50 = 87550000000)
     * @param timestamp Unix timestamp of the reveal
     * 
     * @dev For immediate/public trades, reveal happens in the same tx as commit.
     *      For hidden trades, reveal can happen later (e.g., end of week).
     *      Price is scaled by 1e8 to preserve precision without decimals.
     */
    event TradeRevealed(
        address indexed agent,
        bytes32 indexed commitmentHash,
        string ticker,
        uint256 price,
        uint256 timestamp
    );
    
    // ========================================================================
    // MODIFIERS
    // ========================================================================
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier onlyAuthorized() {
        require(authorized[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }
    
    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================
    
    constructor() {
        owner = msg.sender;
        authorized[msg.sender] = true;
    }
    
    // ========================================================================
    // ADMIN FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Transfer contract ownership
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    /**
     * @notice Set authorization for an address to log trades
     * @param addr Address to authorize/deauthorize
     * @param auth True to authorize, false to revoke
     * 
     * @dev Authorized addresses can log trades on behalf of agents.
     *      This allows the platform to batch transactions while
     *      maintaining agent wallet as the identity.
     */
    function setAuthorized(address addr, bool auth) external onlyOwner {
        authorized[addr] = auth;
    }
    
    // ========================================================================
    // REGISTRATION FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Register a new agent on-chain
     * @param agent Wallet address of the agent
     * @param name Display name for the agent
     * 
     * @dev Can be called by the agent themselves or by an authorized address.
     *      Emits AgentRegistered event establishing on-chain identity.
     */
    function registerAgent(address agent, string calldata name) external onlyAuthorized {
        require(agent != address(0), "Invalid agent address");
        require(!registeredAgents[agent], "Agent already registered");
        
        registeredAgents[agent] = true;
        emit AgentRegistered(agent, name, block.timestamp);
    }
    
    /**
     * @notice Update an agent's display name
     * @param agent Wallet address of the agent
     * @param newName New display name
     */
    function updateAgentName(address agent, string calldata newName) external onlyAuthorized {
        require(registeredAgents[agent], "Agent not registered");
        emit AgentNameUpdated(agent, newName, block.timestamp);
    }
    
    // ========================================================================
    // TRADE LOGGING FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Log a trade commitment on-chain
     * @param agent Wallet address of the trading agent
     * @param commitmentHash Hash of full trade data
     * @param action "OPEN" or "CLOSE"
     * @param direction "LONG" or "SHORT"
     * @param lobs Amount in LOBS
     * @param timestamp Unix timestamp of the trade
     */
    function logCommit(
        address agent,
        bytes32 commitmentHash,
        string calldata action,
        string calldata direction,
        uint256 lobs,
        uint256 timestamp
    ) external onlyAuthorized {
        emit TradeCommitted(agent, commitmentHash, action, direction, lobs, timestamp);
    }
    
    /**
     * @notice Log a trade reveal on-chain
     * @param agent Wallet address of the trading agent
     * @param commitmentHash Original commitment hash
     * @param ticker Stock/crypto symbol
     * @param price Execution price (scaled by 1e8)
     * @param timestamp Unix timestamp of the reveal
     */
    function logReveal(
        address agent,
        bytes32 commitmentHash,
        string calldata ticker,
        uint256 price,
        uint256 timestamp
    ) external onlyAuthorized {
        emit TradeRevealed(agent, commitmentHash, ticker, price, timestamp);
    }
    
    // ========================================================================
    // BATCH FUNCTIONS (gas optimization)
    // ========================================================================
    
    /**
     * @notice Batch register multiple agents
     * @param agents Array of wallet addresses
     * @param names Array of display names
     */
    function batchRegisterAgents(
        address[] calldata agents,
        string[] calldata names
    ) external onlyAuthorized {
        require(agents.length == names.length, "Array length mismatch");
        
        for (uint256 i = 0; i < agents.length; i++) {
            if (!registeredAgents[agents[i]] && agents[i] != address(0)) {
                registeredAgents[agents[i]] = true;
                emit AgentRegistered(agents[i], names[i], block.timestamp);
            }
        }
    }
    
    /**
     * @notice Batch log multiple commits
     */
    function batchLogCommits(
        address[] calldata agents,
        bytes32[] calldata commitmentHashes,
        string[] calldata actions,
        string[] calldata directions,
        uint256[] calldata lobsAmounts,
        uint256[] calldata timestamps
    ) external onlyAuthorized {
        require(
            agents.length == commitmentHashes.length &&
            agents.length == actions.length &&
            agents.length == directions.length &&
            agents.length == lobsAmounts.length &&
            agents.length == timestamps.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < agents.length; i++) {
            emit TradeCommitted(
                agents[i],
                commitmentHashes[i],
                actions[i],
                directions[i],
                lobsAmounts[i],
                timestamps[i]
            );
        }
    }
    
    /**
     * @notice Batch log multiple reveals
     */
    function batchLogReveals(
        address[] calldata agents,
        bytes32[] calldata commitmentHashes,
        string[] calldata tickers,
        uint256[] calldata prices,
        uint256[] calldata timestamps
    ) external onlyAuthorized {
        require(
            agents.length == commitmentHashes.length &&
            agents.length == tickers.length &&
            agents.length == prices.length &&
            agents.length == timestamps.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < agents.length; i++) {
            emit TradeRevealed(
                agents[i],
                commitmentHashes[i],
                tickers[i],
                prices[i],
                timestamps[i]
            );
        }
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
    /**
     * @notice Check if an agent is registered
     * @param agent Wallet address to check
     * @return True if registered
     */
    function isRegistered(address agent) external view returns (bool) {
        return registeredAgents[agent];
    }
}
