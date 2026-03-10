// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPermit2, ISignatureTransfer} from "permit2/src/interfaces/IPermit2.sol";

/**
 * @title RPSEscrowV2
 * @notice Rock-Paper-Scissors with bluffing - alternating bluff advantage per round
 * @dev Round 1: Creator bluffs, Round 2: Challenger bluffs, etc.
 */
contract RPSEscrowV2 {
    // ============ Constants ============
    IPermit2 public immutable PERMIT2;
    IERC20 public immutable USDC;
    address public owner;
    
    uint256 public constant RAKE_BPS = 100; // 1%
    uint256 public constant MIN_STAKE = 0.10e6;
    uint256 public constant MAX_STAKE = 1000e6;
    uint256 public constant GAME_TIMEOUT = 24 hours;
    
    // ============ Types ============
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
        bytes32 currentCommitment;
        bool creatorTurn;
    }
    
    struct Round {
        bytes32 creatorCommit;
        bytes32 challengerCommit;
        Play creatorPlay;
        Play challengerPlay;
        Play creatorBluff;      // NEW: what creator showed
        Play challengerBluff;   // NEW: what challenger showed
        address winner;
        bool revealed;
    }
    
    // ============ Storage ============
    mapping(bytes32 => Game) public games;
    mapping(bytes32 => mapping(uint8 => Round)) public rounds;
    mapping(bytes32 => uint8) public currentRound;
    
    uint256 public totalRakeCollected;
    uint256 public totalVolume;
    
    // ============ Events ============
    event GameCreated(bytes32 indexed gameId, address indexed creator, uint96 stake, uint8 bestOf);
    event GameChallenged(bytes32 indexed gameId, address indexed challenger);
    event PlayCommitted(bytes32 indexed gameId, uint8 round, address indexed player, bytes32 commitment, Play bluff);
    event PlayRevealed(bytes32 indexed gameId, uint8 round, address indexed player, Play play, Play bluff, bool wasBluff);
    event RoundComplete(bytes32 indexed gameId, uint8 round, address winner);
    event GameComplete(bytes32 indexed gameId, address indexed winner, uint256 payout, uint256 rake);
    event GameCancelled(bytes32 indexed gameId, address indexed by);
    event GameExpired(bytes32 indexed gameId);
    
    // ============ Errors ============
    error InvalidStake();
    error InvalidBestOf();
    error InvalidCommitment();
    error GameNotOpen();
    error GameNotActive();
    error NotParticipant();
    error NotYourTurn();
    error CantChallengeSelf();
    error GameExpiredError();
    error AlreadyRevealed();
    error InvalidReveal();
    error GameNotComplete();
    error InvalidBluff();
    
    constructor(address _permit2, address _usdc) {
        PERMIT2 = IPermit2(_permit2);
        USDC = IERC20(_usdc);
        owner = msg.sender;
    }
    
    // ============ Game Creation ============
    
    function createGame(
        uint96 stake,
        uint8 bestOf,
        bytes32 commitment,
        Play bluff,  // Creator's bluff for round 1
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external returns (bytes32 gameId) {
        if (stake < MIN_STAKE || stake > MAX_STAKE) revert InvalidStake();
        if (bestOf != 1 && bestOf != 3 && bestOf != 5 && bestOf != 7) revert InvalidBestOf();
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (bluff == Play.None) revert InvalidBluff();
        
        gameId = keccak256(abi.encodePacked(msg.sender, block.timestamp, bestOf));
        
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
            currentCommitment: bytes32(0),
            creatorTurn: false  // Will be set properly on challenge
        });
        
        currentRound[gameId] = 1;
        
        // Store creator's round 1 commitment and bluff
        rounds[gameId][1].creatorCommit = commitment;
        rounds[gameId][1].creatorBluff = bluff;
        
        emit GameCreated(gameId, msg.sender, stake, bestOf);
        emit PlayCommitted(gameId, 1, msg.sender, commitment, bluff);
    }
    
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
        
        game.challenger = msg.sender;
        game.status = GameStatus.Active;
        game.challengedAt = uint40(block.timestamp);
        
        // Challenger commits for round 1 (no bluff - they react to creator's bluff)
        rounds[gameId][1].challengerCommit = commitment;
        
        emit GameChallenged(gameId, msg.sender);
        emit PlayCommitted(gameId, 1, msg.sender, commitment, Play.None);
    }
    
    // ============ Commit Phase (for rounds 2+) ============
    
    // Called by the bluffer for the round
    function commitWithBluff(
        bytes32 gameId,
        bytes32 commitment,
        Play bluff
    ) external {
        Game storage game = games[gameId];
        if (game.status != GameStatus.Active) revert GameNotActive();
        if (bluff == Play.None) revert InvalidBluff();
        
        uint8 roundNum = currentRound[gameId];
        Round storage round = rounds[gameId][roundNum];
        
        // Determine who bluffs this round (odd = creator, even = challenger)
        bool creatorBluffs = (roundNum % 2 == 1);
        
        if (creatorBluffs) {
            if (msg.sender != game.creator) revert NotYourTurn();
            if (round.creatorCommit != bytes32(0)) revert InvalidCommitment();
            round.creatorCommit = commitment;
            round.creatorBluff = bluff;
        } else {
            if (msg.sender != game.challenger) revert NotYourTurn();
            if (round.challengerCommit != bytes32(0)) revert InvalidCommitment();
            round.challengerCommit = commitment;
            round.challengerBluff = bluff;
        }
        
        emit PlayCommitted(gameId, roundNum, msg.sender, commitment, bluff);
    }
    
    // Called by the reactor (sees bluff, then commits)
    function commitReaction(
        bytes32 gameId,
        bytes32 commitment
    ) external {
        Game storage game = games[gameId];
        if (game.status != GameStatus.Active) revert GameNotActive();
        
        uint8 roundNum = currentRound[gameId];
        Round storage round = rounds[gameId][roundNum];
        
        // Determine who reacts this round (odd = challenger, even = creator)
        bool challengerReacts = (roundNum % 2 == 1);
        
        if (challengerReacts) {
            if (msg.sender != game.challenger) revert NotYourTurn();
            // Bluffer must have committed first
            if (round.creatorCommit == bytes32(0)) revert NotYourTurn();
            if (round.challengerCommit != bytes32(0)) revert InvalidCommitment();
            round.challengerCommit = commitment;
        } else {
            if (msg.sender != game.creator) revert NotYourTurn();
            // Bluffer must have committed first
            if (round.challengerCommit == bytes32(0)) revert NotYourTurn();
            if (round.creatorCommit != bytes32(0)) revert InvalidCommitment();
            round.creatorCommit = commitment;
        }
        
        emit PlayCommitted(gameId, roundNum, msg.sender, commitment, Play.None);
    }
    
    // ============ Reveal Phase ============
    
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
        
        bytes32 commitment = keccak256(abi.encodePacked(uint8(play), secret));
        
        if (isCreator) {
            if (round.creatorPlay != Play.None) revert AlreadyRevealed();
            if (round.creatorCommit != commitment) revert InvalidReveal();
            round.creatorPlay = play;
            
            bool wasBluff = round.creatorBluff != Play.None && round.creatorBluff != play;
            emit PlayRevealed(gameId, roundNum, msg.sender, play, round.creatorBluff, wasBluff);
        } else {
            if (round.challengerPlay != Play.None) revert AlreadyRevealed();
            if (round.challengerCommit != commitment) revert InvalidReveal();
            round.challengerPlay = play;
            
            bool wasBluff = round.challengerBluff != Play.None && round.challengerBluff != play;
            emit PlayRevealed(gameId, roundNum, msg.sender, play, round.challengerBluff, wasBluff);
        }
        
        // Check if both revealed
        if (round.creatorPlay != Play.None && round.challengerPlay != Play.None) {
            _resolveRound(gameId, roundNum);
        }
    }
    
    // ============ Resolution ============
    
    function _resolveRound(bytes32 gameId, uint8 roundNum) internal {
        Game storage game = games[gameId];
        Round storage round = rounds[gameId][roundNum];
        
        round.revealed = true;
        
        Play cp = round.creatorPlay;
        Play chp = round.challengerPlay;
        
        address roundWinner;
        
        // Determine winner: Rock=1, Paper=2, Scissors=3
        // Rock beats Scissors, Scissors beats Paper, Paper beats Rock
        if (cp == chp) {
            // Tie - no winner, replay round
            roundWinner = address(0);
            round.creatorPlay = Play.None;
            round.challengerPlay = Play.None;
            round.creatorCommit = bytes32(0);
            round.challengerCommit = bytes32(0);
            round.creatorBluff = Play.None;
            round.challengerBluff = Play.None;
            round.revealed = false;
            game.creatorTurn = !game.creatorTurn;
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
            // Move to next round
            currentRound[gameId] = roundNum + 1;
            game.creatorTurn = (roundNum % 2 == 0); // Alternate who bluffs
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
    
    // ============ Cancellation & Expiry ============
    
    function cancelGame(bytes32 gameId) external {
        Game storage game = games[gameId];
        if (game.status != GameStatus.Open) revert GameNotOpen();
        if (msg.sender != game.creator) revert NotParticipant();
        
        game.status = GameStatus.Cancelled;
        USDC.transfer(game.creator, game.stake);
        
        emit GameCancelled(gameId, msg.sender);
    }
    
    function claimExpired(bytes32 gameId) external {
        Game storage game = games[gameId];
        if (game.status != GameStatus.Active) revert GameNotActive();
        
        uint8 roundNum = currentRound[gameId];
        Round storage round = rounds[gameId][roundNum];
        
        bool isCreator = msg.sender == game.creator;
        bool isChallenger = msg.sender == game.challenger;
        if (!isCreator && !isChallenger) revert NotParticipant();
        
        // Check timeout
        if (block.timestamp < game.challengedAt + GAME_TIMEOUT) revert GameNotComplete();
        
        // Determine who failed to act - they forfeit
        address winner;
        bool creatorBluffs = (roundNum % 2 == 1);
        
        if (round.creatorCommit == bytes32(0) && creatorBluffs) {
            winner = game.challenger; // Creator failed to bluff
        } else if (round.challengerCommit == bytes32(0) && !creatorBluffs) {
            winner = game.creator; // Challenger failed to bluff
        } else if (round.creatorCommit == bytes32(0)) {
            winner = game.challenger; // Creator failed to react
        } else if (round.challengerCommit == bytes32(0)) {
            winner = game.creator; // Challenger failed to react
        } else if (round.creatorPlay == Play.None) {
            winner = game.challenger; // Creator failed to reveal
        } else {
            winner = game.creator; // Challenger failed to reveal
        }
        
        game.status = GameStatus.Expired;
        game.winner = winner;
        
        uint256 pot = uint256(game.stake) * 2;
        uint256 rake = (pot * RAKE_BPS) / 10000;
        uint256 payout = pot - rake;
        
        totalRakeCollected += rake;
        
        USDC.transfer(winner, payout);
        
        emit GameExpired(gameId);
        emit GameComplete(gameId, winner, payout, rake);
    }
    
    // ============ Views ============
    
    function getGame(bytes32 gameId) external view returns (Game memory) {
        return games[gameId];
    }
    
    function getRound(bytes32 gameId, uint8 roundNum) external view returns (Round memory) {
        return rounds[gameId][roundNum];
    }
    
    function getCurrentRound(bytes32 gameId) external view returns (uint8) {
        return currentRound[gameId];
    }
    
    // ============ Admin ============
    
    function withdrawRake(address to) external {
        require(msg.sender == owner, "Not owner");
        uint256 balance = USDC.balanceOf(address(this));
        if (totalRakeCollected > 0) {
            uint256 rake = totalRakeCollected;
            totalRakeCollected = 0;
            USDC.transfer(to, rake);
        }
    }
    
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Not owner");
        owner = newOwner;
    }
}
