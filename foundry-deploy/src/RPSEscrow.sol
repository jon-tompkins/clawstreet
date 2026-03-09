// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPermit2, ISignatureTransfer} from "permit2/src/interfaces/IPermit2.sol";

/**
 * @title RPSEscrow
 * @notice Rock-Paper-Scissors escrow using Permit2 for gasless deposits
 * @dev Players sign Permit2 permits, stakes pulled on challenge, winner claims pot
 * 
 * Flow:
 * 1. Creator calls createGame() with their Permit2 signature
 * 2. Challenger calls challenge() with their Permit2 signature
 * 3. Both stakes pulled into escrow
 * 4. Game plays out (commit-reveal off-chain, logged to TradeLog contract)
 * 5. Winner calls claim() with proof of victory
 */
contract RPSEscrow {
    // ============ Constants ============
    IPermit2 public immutable PERMIT2;
    IERC20 public immutable USDC;
    address public owner;
    
    uint256 public constant RAKE_BPS = 100; // 1% = 100 basis points
    uint256 public constant MIN_STAKE = 0.10e6; // 0.10 USDC (6 decimals)
    uint256 public constant MAX_STAKE = 1000e6; // 1000 USDC
    uint256 public constant GAME_TIMEOUT = 24 hours;
    
    // ============ Types ============
    enum GameStatus { Open, Active, Completed, Cancelled, Expired }
    enum Play { None, Rock, Paper, Scissors }
    
    struct Game {
        address creator;
        address challenger;
        uint96 stake;           // USDC amount (6 decimals)
        uint8 bestOf;           // 1, 3, 5, or 7
        GameStatus status;
        address winner;
        uint8 creatorWins;
        uint8 challengerWins;
        uint40 createdAt;
        uint40 challengedAt;
        bytes32 currentCommitment; // Current round's commitment (creator or challenger)
        bool creatorTurn;       // Whose turn to commit
    }
    
    struct Round {
        bytes32 creatorCommit;
        bytes32 challengerCommit;
        Play creatorPlay;
        Play challengerPlay;
        address winner;         // address(0) = tie
        bool revealed;
    }
    
    // ============ Storage ============
    mapping(bytes32 => Game) public games;
    mapping(bytes32 => mapping(uint8 => Round)) public rounds; // gameId => roundNum => Round
    mapping(bytes32 => uint8) public currentRound; // gameId => current round number
    
    uint256 public totalRakeCollected;
    uint256 public totalVolume;
    
    // ============ Events ============
    event GameCreated(bytes32 indexed gameId, address indexed creator, uint96 stake, uint8 bestOf);
    event GameChallenged(bytes32 indexed gameId, address indexed challenger);
    event PlayCommitted(bytes32 indexed gameId, uint8 round, address indexed player, bytes32 commitment);
    event PlayRevealed(bytes32 indexed gameId, uint8 round, address indexed player, Play play);
    event RoundComplete(bytes32 indexed gameId, uint8 round, address winner);
    event GameComplete(bytes32 indexed gameId, address indexed winner, uint256 payout, uint256 rake);
    event GameCancelled(bytes32 indexed gameId, address indexed by);
    event GameExpired(bytes32 indexed gameId);
    
    // ============ Errors ============
    error InvalidStake();
    error InvalidBestOf();
    error GameNotOpen();
    error GameNotActive();
    error NotYourTurn();
    error InvalidCommitment();
    error InvalidReveal();
    error AlreadyRevealed();
    error GameNotComplete();
    error NotParticipant();
    error CantChallengeSelf();
    error GameExpiredError();
    
    // ============ Constructor ============
    constructor(address _permit2, address _usdc) {
        PERMIT2 = IPermit2(_permit2);
        USDC = IERC20(_usdc);
        owner = msg.sender;
    }
    
    // ============ Game Creation ============
    
    /**
     * @notice Create a new game with Permit2 signature for stake
     * @param stake Amount of USDC to stake (6 decimals)
     * @param bestOf Number of rounds (1, 3, 5, or 7)
     * @param commitment Hash of first play: keccak256(abi.encodePacked(play, secret))
     * @param permit Permit2 signature data
     * @param signature The signature bytes
     */
    function createGame(
        uint96 stake,
        uint8 bestOf,
        bytes32 commitment,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external returns (bytes32 gameId) {
        // Validate
        if (stake < MIN_STAKE || stake > MAX_STAKE) revert InvalidStake();
        if (bestOf != 1 && bestOf != 3 && bestOf != 5 && bestOf != 7) revert InvalidBestOf();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        
        // Generate game ID
        gameId = keccak256(abi.encodePacked(msg.sender, block.timestamp, commitment));
        
        // Pull stake via Permit2
        PERMIT2.permitTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({
                to: address(this),
                requestedAmount: stake
            }),
            msg.sender,
            signature
        );
        
        // Create game
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
            currentCommitment: commitment,
            creatorTurn: false // Creator already committed, challenger's turn
        });
        
        // Store first round commitment
        currentRound[gameId] = 1;
        rounds[gameId][1].creatorCommit = commitment;
        
        emit GameCreated(gameId, msg.sender, stake, bestOf);
        emit PlayCommitted(gameId, 1, msg.sender, commitment);
    }
    
    /**
     * @notice Challenge an open game with Permit2 signature
     * @param gameId The game to challenge
     * @param commitment Hash of your play for round 1
     * @param permit Permit2 signature data
     * @param signature The signature bytes
     */
    function challenge(
        bytes32 gameId,
        bytes32 commitment,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external {
        Game storage game = games[gameId];
        
        if (game.status != GameStatus.Open) revert GameNotOpen();
        if (msg.sender == game.creator) revert CantChallengeSelf();
        if (block.timestamp > game.createdAt + GAME_TIMEOUT) revert GameExpiredError();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        
        // Pull stake via Permit2
        PERMIT2.permitTransferFrom(
            permit,
            ISignatureTransfer.SignatureTransferDetails({
                to: address(this),
                requestedAmount: game.stake
            }),
            msg.sender,
            signature
        );
        
        // Update game
        game.challenger = msg.sender;
        game.status = GameStatus.Active;
        game.challengedAt = uint40(block.timestamp);
        
        // Store challenger's commitment
        rounds[gameId][1].challengerCommit = commitment;
        
        emit GameChallenged(gameId, msg.sender);
        emit PlayCommitted(gameId, 1, msg.sender, commitment);
    }
    
    // ============ Gameplay ============
    
    /**
     * @notice Reveal your play for the current round
     * @param gameId The game ID
     * @param play Your play (1=Rock, 2=Paper, 3=Scissors)
     * @param secret The secret used in commitment
     */
    function reveal(
        bytes32 gameId,
        Play play,
        bytes32 secret
    ) external {
        Game storage game = games[gameId];
        if (game.status != GameStatus.Active) revert GameNotActive();
        
        uint8 roundNum = currentRound[gameId];
        Round storage round = rounds[gameId][roundNum];
        
        bool isCreator = msg.sender == game.creator;
        bool isChallenger = msg.sender == game.challenger;
        if (!isCreator && !isChallenger) revert NotParticipant();
        
        // Verify commitment
        bytes32 commitment = keccak256(abi.encodePacked(uint8(play), secret));
        
        if (isCreator) {
            if (round.creatorPlay != Play.None) revert AlreadyRevealed();
            if (commitment != round.creatorCommit) revert InvalidReveal();
            round.creatorPlay = play;
            emit PlayRevealed(gameId, roundNum, msg.sender, play);
        } else {
            if (round.challengerPlay != Play.None) revert AlreadyRevealed();
            if (commitment != round.challengerCommit) revert InvalidReveal();
            round.challengerPlay = play;
            emit PlayRevealed(gameId, roundNum, msg.sender, play);
        }
        
        // Check if both revealed
        if (round.creatorPlay != Play.None && round.challengerPlay != Play.None) {
            _resolveRound(gameId, roundNum);
        }
    }
    
    /**
     * @notice Commit play for next round (after current round resolved)
     * @param gameId The game ID
     * @param commitment Hash of your play
     */
    function commitPlay(
        bytes32 gameId,
        bytes32 commitment
    ) external {
        Game storage game = games[gameId];
        if (game.status != GameStatus.Active) revert GameNotActive();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        
        uint8 roundNum = currentRound[gameId];
        Round storage round = rounds[gameId][roundNum];
        
        bool isCreator = msg.sender == game.creator;
        bool isChallenger = msg.sender == game.challenger;
        if (!isCreator && !isChallenger) revert NotParticipant();
        
        // Check it's your turn
        if (isCreator && !game.creatorTurn) revert NotYourTurn();
        if (isChallenger && game.creatorTurn) revert NotYourTurn();
        
        // Store commitment
        if (isCreator) {
            if (round.creatorCommit != bytes32(0)) revert InvalidCommitment();
            round.creatorCommit = commitment;
        } else {
            if (round.challengerCommit != bytes32(0)) revert InvalidCommitment();
            round.challengerCommit = commitment;
        }
        
        // Toggle turn
        game.creatorTurn = !game.creatorTurn;
        
        emit PlayCommitted(gameId, roundNum, msg.sender, commitment);
    }
    
    // ============ Internal ============
    
    function _resolveRound(bytes32 gameId, uint8 roundNum) internal {
        Game storage game = games[gameId];
        Round storage round = rounds[gameId][roundNum];
        
        round.revealed = true;
        
        // Determine winner: Rock=1, Paper=2, Scissors=3
        // Rock beats Scissors, Scissors beats Paper, Paper beats Rock
        Play cp = round.creatorPlay;
        Play chp = round.challengerPlay;
        
        address roundWinner;
        if (cp == chp) {
            // Tie - replay round
            roundWinner = address(0);
            // Reset for replay
            round.creatorPlay = Play.None;
            round.challengerPlay = Play.None;
            round.creatorCommit = bytes32(0);
            round.challengerCommit = bytes32(0);
            round.revealed = false;
            // Loser of previous round goes first (or creator if tie on round 1)
            game.creatorTurn = true;
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
        
        round.winner = roundWinner;
        emit RoundComplete(gameId, roundNum, roundWinner);
        
        // Check for game winner
        uint8 winsNeeded = (game.bestOf / 2) + 1;
        
        if (game.creatorWins >= winsNeeded) {
            _completeGame(gameId, game.creator);
        } else if (game.challengerWins >= winsNeeded) {
            _completeGame(gameId, game.challenger);
        } else if (roundWinner != address(0)) {
            // Next round - loser goes first
            currentRound[gameId] = roundNum + 1;
            game.creatorTurn = (roundWinner == game.challenger); // Loser commits first
        }
    }
    
    function _completeGame(bytes32 gameId, address winner) internal {
        Game storage game = games[gameId];
        game.status = GameStatus.Completed;
        game.winner = winner;
        
        // Calculate payout
        uint256 pot = uint256(game.stake) * 2;
        uint256 rake = (pot * RAKE_BPS) / 10000;
        uint256 payout = pot - rake;
        
        totalRakeCollected += rake;
        totalVolume += pot;
        
        // Pay winner
        USDC.transfer(winner, payout);
        
        // Rake stays in contract (owner can withdraw)
        
        emit GameComplete(gameId, winner, payout, rake);
    }
    
    // ============ Cancellation / Expiry ============
    
    /**
     * @notice Cancel an open game (creator only, before challenge)
     */
    function cancelGame(bytes32 gameId) external {
        Game storage game = games[gameId];
        if (game.status != GameStatus.Open) revert GameNotOpen();
        if (msg.sender != game.creator) revert NotParticipant();
        
        game.status = GameStatus.Cancelled;
        
        // Refund creator
        USDC.transfer(game.creator, game.stake);
        
        emit GameCancelled(gameId, msg.sender);
    }
    
    /**
     * @notice Claim expired game (if opponent hasn't moved in 24h)
     */
    function claimExpired(bytes32 gameId) external {
        Game storage game = games[gameId];
        if (game.status != GameStatus.Active) revert GameNotActive();
        
        // Check timeout
        uint8 roundNum = currentRound[gameId];
        Round storage round = rounds[gameId][roundNum];
        
        bool isCreator = msg.sender == game.creator;
        bool isChallenger = msg.sender == game.challenger;
        if (!isCreator && !isChallenger) revert NotParticipant();
        
        // Determine who's stalling
        bool creatorStalling;
        if (round.creatorCommit == bytes32(0) && game.creatorTurn) {
            creatorStalling = true;
        } else if (round.challengerCommit == bytes32(0) && !game.creatorTurn) {
            creatorStalling = false;
        } else if (round.creatorPlay == Play.None && round.challengerPlay != Play.None) {
            creatorStalling = true;
        } else if (round.challengerPlay == Play.None && round.creatorPlay != Play.None) {
            creatorStalling = false;
        } else {
            revert GameNotComplete(); // Neither is clearly stalling
        }
        
        // Check if staller has timed out
        if (block.timestamp < game.challengedAt + GAME_TIMEOUT) {
            revert GameNotComplete();
        }
        
        // Award win to non-staller
        address winner = creatorStalling ? game.challenger : game.creator;
        game.status = GameStatus.Expired;
        game.winner = winner;
        
        // Pay out
        uint256 pot = uint256(game.stake) * 2;
        uint256 rake = (pot * RAKE_BPS) / 10000;
        uint256 payout = pot - rake;
        
        totalRakeCollected += rake;
        USDC.transfer(winner, payout);
        
        emit GameExpired(gameId);
        emit GameComplete(gameId, winner, payout, rake);
    }
    
    // ============ Admin ============
    
    function withdrawRake(address to) external {
        require(msg.sender == owner, "Not owner");
        uint256 balance = USDC.balanceOf(address(this));
        // Only withdraw rake, not active game stakes
        // For safety, just withdraw what we've tracked
        if (totalRakeCollected > 0) {
            uint256 amount = totalRakeCollected;
            totalRakeCollected = 0;
            USDC.transfer(to, amount);
        }
    }
    
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Not owner");
        owner = newOwner;
    }
    
    // ============ View ============
    
    function getGame(bytes32 gameId) external view returns (Game memory) {
        return games[gameId];
    }
    
    function getRound(bytes32 gameId, uint8 roundNum) external view returns (Round memory) {
        return rounds[gameId][roundNum];
    }
    
    function getCurrentRound(bytes32 gameId) external view returns (uint8) {
        return currentRound[gameId];
    }
}
