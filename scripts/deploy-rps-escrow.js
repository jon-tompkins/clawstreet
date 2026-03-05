#!/usr/bin/env node
/**
 * Deploy RPSEscrow to Base mainnet
 * 
 * Uses solc to compile and ethers to deploy
 */

const { execSync } = require('child_process');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Config
const BASE_RPC = 'https://mainnet.base.org';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Simplified RPSEscrow without external dependencies for quick deploy
const SIMPLE_RPS_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title RPSEscrow (Simplified)
 * @notice Rock-Paper-Scissors escrow - simplified version using direct transfers
 * @dev Agents need to approve this contract for USDC first
 */
contract RPSEscrow {
    IERC20 public immutable USDC;
    address public owner;
    
    uint256 public constant RAKE_BPS = 100; // 1%
    uint256 public constant MIN_STAKE = 100000; // 0.10 USDC (6 decimals)
    uint256 public constant MAX_STAKE = 1000000000; // 1000 USDC
    uint256 public constant GAME_TIMEOUT = 24 hours;
    
    enum GameStatus { Open, Active, Completed, Cancelled, Expired }
    enum Play { None, Rock, Paper, Scissors }
    
    struct Game {
        address creator;
        address challenger;
        uint96 stake;
        uint8 bestOf;
        GameStatus status;
        address winner;
        uint8 creatorWins;
        uint8 challengerWins;
        uint40 createdAt;
        uint40 challengedAt;
        bytes32 creatorCommit;
        bytes32 challengerCommit;
        Play creatorPlay;
        Play challengerPlay;
        uint8 currentRound;
        bool creatorRevealed;
        bool challengerRevealed;
    }
    
    mapping(bytes32 => Game) public games;
    uint256 public totalRakeCollected;
    uint256 public totalVolume;
    uint256 public gameCount;
    
    event GameCreated(bytes32 indexed gameId, address indexed creator, uint96 stake, uint8 bestOf);
    event GameChallenged(bytes32 indexed gameId, address indexed challenger);
    event PlayCommitted(bytes32 indexed gameId, address indexed player, uint8 round);
    event PlayRevealed(bytes32 indexed gameId, address indexed player, uint8 play);
    event RoundComplete(bytes32 indexed gameId, uint8 round, address winner);
    event GameComplete(bytes32 indexed gameId, address indexed winner, uint256 payout, uint256 rake);
    
    constructor(address _usdc) {
        USDC = IERC20(_usdc);
        owner = msg.sender;
    }
    
    function createGame(uint96 stake, uint8 bestOf, bytes32 commitment) external returns (bytes32 gameId) {
        require(stake >= MIN_STAKE && stake <= MAX_STAKE, "Invalid stake");
        require(bestOf == 1 || bestOf == 3 || bestOf == 5 || bestOf == 7, "Invalid bestOf");
        require(commitment != bytes32(0), "Invalid commitment");
        
        // Pull stake
        require(USDC.transferFrom(msg.sender, address(this), stake), "Transfer failed");
        
        gameId = keccak256(abi.encodePacked(msg.sender, block.timestamp, gameCount++));
        
        games[gameId] = Game({
            creator: msg.sender,
            challenger: address(0),
            stake: stake,
            bestOf: bestOf,
            status: GameStatus.Open,
            winner: address(0),
            creatorWins: 0,
            challengerWins: 0,
            createdAt: uint40(block.timestamp),
            challengedAt: 0,
            creatorCommit: commitment,
            challengerCommit: bytes32(0),
            creatorPlay: Play.None,
            challengerPlay: Play.None,
            currentRound: 1,
            creatorRevealed: false,
            challengerRevealed: false
        });
        
        emit GameCreated(gameId, msg.sender, stake, bestOf);
        emit PlayCommitted(gameId, msg.sender, 1);
    }
    
    function challenge(bytes32 gameId, bytes32 commitment) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Open, "Not open");
        require(msg.sender != game.creator, "Can't self-challenge");
        require(block.timestamp <= game.createdAt + GAME_TIMEOUT, "Expired");
        require(commitment != bytes32(0), "Invalid commitment");
        
        // Pull stake
        require(USDC.transferFrom(msg.sender, address(this), game.stake), "Transfer failed");
        
        game.challenger = msg.sender;
        game.status = GameStatus.Active;
        game.challengedAt = uint40(block.timestamp);
        game.challengerCommit = commitment;
        
        emit GameChallenged(gameId, msg.sender);
        emit PlayCommitted(gameId, msg.sender, 1);
    }
    
    function reveal(bytes32 gameId, uint8 play, bytes32 secret) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Active, "Not active");
        require(play >= 1 && play <= 3, "Invalid play");
        
        bytes32 commitment = keccak256(abi.encodePacked(play, secret));
        
        if (msg.sender == game.creator) {
            require(!game.creatorRevealed, "Already revealed");
            require(commitment == game.creatorCommit, "Bad reveal");
            game.creatorPlay = Play(play);
            game.creatorRevealed = true;
            emit PlayRevealed(gameId, msg.sender, play);
        } else if (msg.sender == game.challenger) {
            require(!game.challengerRevealed, "Already revealed");
            require(commitment == game.challengerCommit, "Bad reveal");
            game.challengerPlay = Play(play);
            game.challengerRevealed = true;
            emit PlayRevealed(gameId, msg.sender, play);
        } else {
            revert("Not participant");
        }
        
        // Both revealed?
        if (game.creatorRevealed && game.challengerRevealed) {
            _resolveRound(gameId);
        }
    }
    
    function commitNextRound(bytes32 gameId, bytes32 commitment) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Active, "Not active");
        require(commitment != bytes32(0), "Invalid commitment");
        
        if (msg.sender == game.creator) {
            require(game.creatorCommit == bytes32(0), "Already committed");
            game.creatorCommit = commitment;
        } else if (msg.sender == game.challenger) {
            require(game.challengerCommit == bytes32(0), "Already committed");
            game.challengerCommit = commitment;
        } else {
            revert("Not participant");
        }
        
        emit PlayCommitted(gameId, msg.sender, game.currentRound);
    }
    
    function _resolveRound(bytes32 gameId) internal {
        Game storage game = games[gameId];
        
        Play cp = game.creatorPlay;
        Play chp = game.challengerPlay;
        
        address roundWinner;
        
        if (cp == chp) {
            // Tie - replay
            roundWinner = address(0);
        } else if (
            (cp == Play.Rock && chp == Play.Scissors) ||
            (cp == Play.Paper && chp == Play.Rock) ||
            (cp == Play.Scissors && chp == Play.Paper)
        ) {
            roundWinner = game.creator;
            game.creatorWins++;
        } else {
            roundWinner = game.challenger;
            game.challengerWins++;
        }
        
        emit RoundComplete(gameId, game.currentRound, roundWinner);
        
        // Check for game winner
        uint8 winsNeeded = (game.bestOf / 2) + 1;
        
        if (game.creatorWins >= winsNeeded) {
            _completeGame(gameId, game.creator);
        } else if (game.challengerWins >= winsNeeded) {
            _completeGame(gameId, game.challenger);
        } else {
            // Reset for next round
            game.currentRound++;
            game.creatorCommit = bytes32(0);
            game.challengerCommit = bytes32(0);
            game.creatorPlay = Play.None;
            game.challengerPlay = Play.None;
            game.creatorRevealed = false;
            game.challengerRevealed = false;
        }
    }
    
    function _completeGame(bytes32 gameId, address winner) internal {
        Game storage game = games[gameId];
        game.status = GameStatus.Completed;
        game.winner = winner;
        
        uint256 pot = uint256(game.stake) * 2;
        uint256 rake = (pot * RAKE_BPS) / 10000;
        uint256 payout = pot - rake;
        
        totalRakeCollected += rake;
        totalVolume += pot;
        
        USDC.transfer(winner, payout);
        
        emit GameComplete(gameId, winner, payout, rake);
    }
    
    function cancelGame(bytes32 gameId) external {
        Game storage game = games[gameId];
        require(game.status == GameStatus.Open, "Not open");
        require(msg.sender == game.creator, "Not creator");
        
        game.status = GameStatus.Cancelled;
        USDC.transfer(game.creator, game.stake);
    }
    
    function withdrawRake(address to) external {
        require(msg.sender == owner, "Not owner");
        uint256 amount = totalRakeCollected;
        totalRakeCollected = 0;
        USDC.transfer(to, amount);
    }
    
    function getGame(bytes32 gameId) external view returns (
        address creator, address challenger, uint96 stake, uint8 bestOf,
        uint8 status, address winner, uint8 creatorWins, uint8 challengerWins,
        uint8 currentRound
    ) {
        Game storage g = games[gameId];
        return (g.creator, g.challenger, g.stake, g.bestOf,
                uint8(g.status), g.winner, g.creatorWins, g.challengerWins,
                g.currentRound);
    }
}
`;

async function main() {
  // Check for private key
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Missing DEPLOYER_PRIVATE_KEY');
    process.exit(1);
  }
  
  console.log('Compiling RPSEscrow...');
  
  // Write source to temp file
  const srcPath = '/tmp/RPSEscrow.sol';
  fs.writeFileSync(srcPath, SIMPLE_RPS_SOURCE);
  
  // Compile with solc
  try {
    const output = execSync(
      `solc --optimize --optimize-runs 200 --bin --abi ${srcPath} 2>&1`,
      { encoding: 'utf8' }
    );
    
    // Parse output - solc outputs Binary: and Contract JSON ABI:
    const binMatch = output.match(/Binary:\s*\n([0-9a-f]+)/i);
    const abiMatch = output.match(/Contract JSON ABI\s*\n(\[[\s\S]*?\])\n/);
    
    if (!binMatch) {
      console.error('Failed to extract bytecode');
      console.log(output);
      process.exit(1);
    }
    
    const bytecode = '0x' + binMatch[1];
    const abi = abiMatch ? JSON.parse(abiMatch[1]) : [];
    
    console.log(`Bytecode: ${bytecode.length} chars`);
    console.log(`Deploying to Base mainnet...`);
    
    // Connect to Base
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Deployer: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
    
    // Deploy
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy(USDC);
    
    console.log(`Tx: ${contract.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation...');
    
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    
    console.log(`\n✅ Deployed to: ${address}`);
    console.log(`BaseScan: https://basescan.org/address/${address}`);
    
    // Save address
    fs.writeFileSync(
      path.join(__dirname, '../contracts/RPS_ESCROW_ADDRESS.txt'),
      address
    );
    
  } catch (err) {
    console.error('Compilation/deployment failed:', err.message);
    process.exit(1);
  }
}

main().catch(console.error);
