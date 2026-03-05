// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TradeLogV2 - On-chain trade logging with notes
 * @notice Logs agent trades to Base for cryptographic proof of history
 * @dev V2 adds notes field to reveals for thesis/predictions/arbitrary data
 * 
 * Use cases:
 * - Trade verification (commit ticker+price, reveal later)
 * - Predictions (commit thesis, reveal with results)
 * - Blind auctions (commit bid, reveal after deadline)
 * - Research calls (timestamp analysis before it plays out)
 */
contract TradeLogV2 {
    address public owner;
    
    // Events - indexed fields for efficient querying
    event TradeCommitted(
        bytes32 indexed agentId,
        bytes32 indexed commitmentHash,
        string action,          // OPEN, CLOSE
        string direction,       // LONG, SHORT
        uint256 lobs,
        uint256 timestamp
    );
    
    event TradeRevealed(
        bytes32 indexed agentId,
        bytes32 indexed commitmentHash,
        string ticker,
        uint256 price,          // Scaled by 1e8 (8 decimals)
        string notes,           // Thesis, rationale, or arbitrary data
        uint256 timestamp
    );
    
    // For generic predictions (non-trade)
    event PredictionCommitted(
        bytes32 indexed agentId,
        bytes32 indexed commitmentHash,
        string category,        // e.g., "election", "earnings", "price"
        uint256 timestamp
    );
    
    event PredictionRevealed(
        bytes32 indexed agentId,
        bytes32 indexed commitmentHash,
        string prediction,      // The actual prediction text
        string outcome,         // What happened (optional, can be empty)
        uint256 timestamp
    );
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @notice Log a trade commitment (hidden ticker/price/notes)
     * @param agentId Agent identifier (wallet address as bytes32)
     * @param commitmentHash Hash of full trade data including hidden fields
     * @param action OPEN or CLOSE
     * @param direction LONG or SHORT
     * @param lobs Amount in LOBS
     * @param timestamp Unix timestamp of trade
     */
    function logCommit(
        bytes32 agentId,
        bytes32 commitmentHash,
        string calldata action,
        string calldata direction,
        uint256 lobs,
        uint256 timestamp
    ) external onlyOwner {
        emit TradeCommitted(
            agentId,
            commitmentHash,
            action,
            direction,
            lobs,
            timestamp
        );
    }
    
    /**
     * @notice Log a trade reveal (exposes ticker/price/notes)
     * @param agentId Agent identifier (wallet address as bytes32)
     * @param commitmentHash Original commitment hash (links to commit)
     * @param ticker Symbol (e.g., "NVDA", "BTC-USD")
     * @param price Execution price scaled by 1e8
     * @param notes Thesis/rationale (can be empty string)
     * @param timestamp Unix timestamp of reveal
     */
    function logReveal(
        bytes32 agentId,
        bytes32 commitmentHash,
        string calldata ticker,
        uint256 price,
        string calldata notes,
        uint256 timestamp
    ) external onlyOwner {
        emit TradeRevealed(
            agentId,
            commitmentHash,
            ticker,
            price,
            notes,
            timestamp
        );
    }
    
    /**
     * @notice Log a generic prediction commitment
     * @param agentId Agent identifier
     * @param commitmentHash Hash of prediction + secret
     * @param category Type of prediction (e.g., "price", "event")
     * @param timestamp Unix timestamp
     */
    function logPredictionCommit(
        bytes32 agentId,
        bytes32 commitmentHash,
        string calldata category,
        uint256 timestamp
    ) external onlyOwner {
        emit PredictionCommitted(
            agentId,
            commitmentHash,
            category,
            timestamp
        );
    }
    
    /**
     * @notice Log a prediction reveal
     * @param agentId Agent identifier
     * @param commitmentHash Original commitment hash
     * @param prediction The prediction text
     * @param outcome What actually happened (optional)
     * @param timestamp Unix timestamp of reveal
     */
    function logPredictionReveal(
        bytes32 agentId,
        bytes32 commitmentHash,
        string calldata prediction,
        string calldata outcome,
        uint256 timestamp
    ) external onlyOwner {
        emit PredictionRevealed(
            agentId,
            commitmentHash,
            prediction,
            outcome,
            timestamp
        );
    }
    
    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
