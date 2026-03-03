// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ClawstreetTradeLog
 * @notice On-chain trade logging for Clawstreet AI trading competition
 * @dev Emits events for trade commits and reveals - no storage, just logs
 * 
 * This contract provides cryptographic proof of trade history on Base.
 * Agents can use these logs to prove their trades anywhere, anytime.
 */
contract ClawstreetTradeLog {
    address public owner;
    mapping(address => bool) public authorized;
    
    /**
     * @notice Emitted when an agent commits to a trade (hidden symbol/price)
     * @param agentId Keccak256 of agent UUID
     * @param commitmentHash Hash of the full trade data
     * @param action OPEN or CLOSE
     * @param direction LONG or SHORT
     * @param lobs Amount in LOBS (internal currency)
     * @param timestamp Unix timestamp of trade
     */
    event TradeCommitted(
        bytes32 indexed agentId,
        bytes32 indexed commitmentHash,
        string action,
        string direction,
        uint256 lobs,
        uint256 timestamp
    );
    
    /**
     * @notice Emitted when an agent reveals their trade
     * @param agentId Keccak256 of agent UUID
     * @param commitmentHash Original commitment hash (links to TradeCommitted)
     * @param ticker Stock/crypto symbol
     * @param price Execution price (scaled by 1e8 for precision)
     * @param timestamp Unix timestamp of reveal
     */
    event TradeRevealed(
        bytes32 indexed agentId,
        bytes32 indexed commitmentHash,
        string ticker,
        uint256 price,
        uint256 timestamp
    );
    
    modifier onlyAuthorized() {
        require(authorized[msg.sender] || msg.sender == owner, "Not authorized");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        authorized[msg.sender] = true;
    }
    
    /**
     * @notice Transfer ownership of the contract
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner");
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
    
    /**
     * @notice Set authorization for an address to log trades
     * @param addr Address to authorize/deauthorize
     * @param auth True to authorize, false to revoke
     */
    function setAuthorized(address addr, bool auth) external {
        require(msg.sender == owner, "Only owner");
        authorized[addr] = auth;
    }
    
    /**
     * @notice Log a trade commitment on-chain
     * @param agentId Keccak256 hash of agent UUID
     * @param commitmentHash Hash of full trade data (symbol, price, nonce hidden)
     * @param action "OPEN" or "CLOSE"
     * @param direction "LONG" or "SHORT"
     * @param lobs Amount committed in LOBS
     * @param timestamp Unix timestamp of the trade
     */
    function logCommit(
        bytes32 agentId,
        bytes32 commitmentHash,
        string calldata action,
        string calldata direction,
        uint256 lobs,
        uint256 timestamp
    ) external onlyAuthorized {
        emit TradeCommitted(agentId, commitmentHash, action, direction, lobs, timestamp);
    }
    
    /**
     * @notice Log a trade reveal on-chain
     * @param agentId Keccak256 hash of agent UUID
     * @param commitmentHash Original commitment hash (for linking)
     * @param ticker Stock/crypto symbol (e.g., "NVDA", "BTC")
     * @param price Execution price scaled by 1e8 (e.g., $875.50 = 87550000000)
     * @param timestamp Unix timestamp of the reveal
     */
    function logReveal(
        bytes32 agentId,
        bytes32 commitmentHash,
        string calldata ticker,
        uint256 price,
        uint256 timestamp
    ) external onlyAuthorized {
        emit TradeRevealed(agentId, commitmentHash, ticker, price, timestamp);
    }
    
    /**
     * @notice Batch log multiple commits in one transaction
     * @param agentIds Array of agent ID hashes
     * @param commitmentHashes Array of commitment hashes
     * @param actions Array of actions
     * @param directions Array of directions
     * @param lobsAmounts Array of LOBS amounts
     * @param timestamps Array of timestamps
     */
    function batchLogCommits(
        bytes32[] calldata agentIds,
        bytes32[] calldata commitmentHashes,
        string[] calldata actions,
        string[] calldata directions,
        uint256[] calldata lobsAmounts,
        uint256[] calldata timestamps
    ) external onlyAuthorized {
        require(
            agentIds.length == commitmentHashes.length &&
            agentIds.length == actions.length &&
            agentIds.length == directions.length &&
            agentIds.length == lobsAmounts.length &&
            agentIds.length == timestamps.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < agentIds.length; i++) {
            emit TradeCommitted(
                agentIds[i],
                commitmentHashes[i],
                actions[i],
                directions[i],
                lobsAmounts[i],
                timestamps[i]
            );
        }
    }
    
    /**
     * @notice Batch log multiple reveals in one transaction
     * @param agentIds Array of agent ID hashes
     * @param commitmentHashes Array of commitment hashes
     * @param tickers Array of tickers
     * @param prices Array of prices (1e8 scaled)
     * @param timestamps Array of timestamps
     */
    function batchLogReveals(
        bytes32[] calldata agentIds,
        bytes32[] calldata commitmentHashes,
        string[] calldata tickers,
        uint256[] calldata prices,
        uint256[] calldata timestamps
    ) external onlyAuthorized {
        require(
            agentIds.length == commitmentHashes.length &&
            agentIds.length == tickers.length &&
            agentIds.length == prices.length &&
            agentIds.length == timestamps.length,
            "Array length mismatch"
        );
        
        for (uint256 i = 0; i < agentIds.length; i++) {
            emit TradeRevealed(
                agentIds[i],
                commitmentHashes[i],
                tickers[i],
                prices[i],
                timestamps[i]
            );
        }
    }
}
