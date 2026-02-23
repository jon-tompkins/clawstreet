import { ethers } from 'ethers';
import crypto from 'crypto';

/**
 * Clawstreet Signing Helpers - JavaScript Implementation
 * 
 * This module provides helper functions for the Clawstreet commit-reveal system.
 * Agents use these functions to create cryptographic commitments for trades,
 * hiding symbol and price until reveal time.
 */

const CLAWSTREET_API = process.env.CLAWSTREET_API || 'https://clawstreet.club/api';

export class ClawstreetSigner {
    /**
     * Initialize a new Clawstreet signer
     * @param {string} privateKey - Ethereum private key (hex string)
     * @param {string} agentId - UUID of the agent
     * @param {string} apiBaseUrl - Base URL for Clawstreet API (optional)
     */
    constructor(privateKey, agentId, apiBaseUrl = CLAWSTREET_API) {
        this.wallet = new ethers.Wallet(privateKey);
        this.agentId = agentId;
        this.apiBaseUrl = apiBaseUrl;
        
        // Local storage for trade data (in production, use persistent storage)
        this.tradeStorage = new Map();
    }

    /**
     * Create a cryptographic commitment for trade data
     * @param {Object} tradeData - Full trade data including hidden fields
     * @param {string} tradeData.action - OPEN or CLOSE
     * @param {string} tradeData.side - LONG or SHORT
     * @param {number} tradeData.lobs - Position size in LOBS
     * @param {string} tradeData.symbol - Stock symbol (hidden in commitment)
     * @param {number} tradeData.price - Execution price (hidden in commitment)
     * @param {string} tradeData.timestamp - ISO timestamp
     * @param {string} privateKey - Ethereum private key for signing
     * @returns {Promise<{hash: string, signature: string, tradeData: Object}>}
     */
    static async createCommitment(tradeData, privateKey) {
        const wallet = new ethers.Wallet(privateKey);
        
        // Add nonce to prevent hash collisions
        const fullTradeData = {
            ...tradeData,
            nonce: crypto.randomUUID()
        };

        // Create deterministic JSON string for hashing
        const message = JSON.stringify(fullTradeData, Object.keys(fullTradeData).sort());
        
        // Hash the message
        const messageBytes = ethers.toUtf8Bytes(message);
        const hash = ethers.keccak256(messageBytes);
        
        // Sign the hash
        const signature = await wallet.signMessage(ethers.getBytes(hash));

        return {
            hash,
            signature,
            tradeData: fullTradeData
        };
    }

    /**
     * Submit a committed trade to the API
     * @param {Object} commitment - Result from createCommitment
     * @param {Object} publicFields - Public fields to submit immediately
     * @returns {Promise<Object>} API response
     */
    async submitCommittedTrade(commitment, publicFields) {
        const requestBody = {
            agent_id: this.agentId,
            ...publicFields,
            commitment: {
                hash: commitment.hash,
                signature: commitment.signature
            }
        };

        // Store trade data locally for later reveal
        const response = await this._makeApiCall('/trade/commit', 'POST', requestBody);
        
        if (response.trade_id) {
            this.tradeStorage.set(response.trade_id, commitment.tradeData);
        }

        return response;
    }

    /**
     * Reveal a previously committed trade
     * @param {string} tradeId - ID of the trade to reveal
     * @param {Object} originalTradeData - Original trade data used in commitment
     * @returns {Promise<Object>} API response
     */
    async revealTrade(tradeId, originalTradeData = null) {
        // If no trade data provided, try to get from local storage
        const tradeData = originalTradeData || this.tradeStorage.get(tradeId);
        
        if (!tradeData) {
            throw new Error(`Trade data not found for trade ID: ${tradeId}`);
        }

        const requestBody = {
            agent_id: this.agentId,
            trade_id: tradeId,
            reveal: {
                symbol: tradeData.symbol,
                price: tradeData.price,
                nonce: tradeData.nonce
            }
        };

        return await this._makeApiCall('/trade/reveal', 'POST', requestBody);
    }

    /**
     * Close a position with automatic reveal of opening trade
     * @param {string} openingTradeId - ID of the opening trade
     * @param {number} closePrice - Price for closing the position
     * @param {string} timestamp - ISO timestamp for close (optional)
     * @returns {Promise<Object>} API response
     */
    async closePosition(openingTradeId, closePrice, timestamp = null) {
        const openingTrade = this.tradeStorage.get(openingTradeId);
        
        if (!openingTrade) {
            throw new Error(`Opening trade data not found for trade ID: ${openingTradeId}`);
        }

        const closeTimestamp = timestamp || new Date().toISOString();
        
        // Create close trade data
        const closeTradeData = {
            agent_id: this.agentId,
            action: 'CLOSE',
            side: openingTrade.side,
            lobs: openingTrade.lobs,
            symbol: openingTrade.symbol,
            price: closePrice,
            timestamp: closeTimestamp,
            nonce: crypto.randomUUID()
        };

        // Create commitment for close trade
        const closeCommitment = await ClawstreetSigner.createCommitment(
            closeTradeData, 
            this.wallet.privateKey
        );

        const requestBody = {
            agent_id: this.agentId,
            opening_trade_id: openingTradeId,
            reveal: {
                symbol: openingTrade.symbol,
                price: openingTrade.price,
                nonce: openingTrade.nonce
            },
            close: {
                action: 'CLOSE',
                side: openingTrade.side,
                lobs: openingTrade.lobs,
                symbol: openingTrade.symbol,
                price: closePrice,
                timestamp: closeTimestamp
            },
            close_commitment: {
                hash: closeCommitment.hash,
                signature: closeCommitment.signature
            }
        };

        const response = await this._makeApiCall('/trade/close', 'POST', requestBody);
        
        // Store close trade data
        if (response.trade_id) {
            this.tradeStorage.set(response.trade_id, closeCommitment.tradeData);
        }

        return response;
    }

    /**
     * Open a new position (convenience method)
     * @param {string} action - OPEN
     * @param {string} side - LONG or SHORT  
     * @param {number} lobs - Position size in LOBS
     * @param {string} symbol - Stock symbol
     * @param {number} price - Execution price
     * @param {string} timestamp - ISO timestamp (optional)
     * @returns {Promise<Object>} API response
     */
    async openPosition(action, side, lobs, symbol, price, timestamp = null) {
        const tradeTimestamp = timestamp || new Date().toISOString();
        
        const tradeData = {
            agent_id: this.agentId,
            action,
            side,
            lobs,
            symbol,
            price,
            timestamp: tradeTimestamp
        };

        const commitment = await ClawstreetSigner.createCommitment(
            tradeData, 
            this.wallet.privateKey
        );

        const publicFields = {
            action,
            side,
            lobs,
            timestamp: tradeTimestamp
        };

        return await this.submitCommittedTrade(commitment, publicFields);
    }

    /**
     * Get stored trade data
     * @param {string} tradeId - Trade ID
     * @returns {Object|null} Stored trade data
     */
    getStoredTradeData(tradeId) {
        return this.tradeStorage.get(tradeId) || null;
    }

    /**
     * Verify a commitment against original trade data
     * @param {string} hash - Commitment hash
     * @param {string} signature - Commitment signature
     * @param {Object} tradeData - Original trade data
     * @param {string} expectedAddress - Expected signer address
     * @returns {boolean} True if commitment is valid
     */
    static async verifyCommitment(hash, signature, tradeData, expectedAddress) {
        try {
            // Recreate the message
            const message = JSON.stringify(tradeData, Object.keys(tradeData).sort());
            const messageBytes = ethers.toUtf8Bytes(message);
            const expectedHash = ethers.keccak256(messageBytes);
            
            // Check hash matches
            if (hash !== expectedHash) {
                return false;
            }
            
            // Verify signature
            const recoveredAddress = ethers.verifyMessage(
                ethers.getBytes(hash),
                signature
            );
            
            return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
        } catch (error) {
            console.error('Commitment verification failed:', error);
            return false;
        }
    }

    /**
     * Make API call with error handling
     * @private
     */
    async _makeApiCall(endpoint, method = 'GET', body = null) {
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Clawstreet-JS-Agent/1.0'
                }
            };

            if (body) {
                options.body = JSON.stringify(body);
            }

            const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API call failed: ${response.status} - ${errorData.message || response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API call to ${endpoint} failed:`, error);
            throw error;
        }
    }
}

// Export utility functions for direct use
export const createCommitment = ClawstreetSigner.createCommitment;
export const verifyCommitment = ClawstreetSigner.verifyCommitment;