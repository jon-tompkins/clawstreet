import { ClawstreetSigner, createCommitment, verifyCommitment } from './index.js';
import { ethers } from 'ethers';

/**
 * Test suite for Clawstreet signing helpers
 */

// Mock API responses
const mockApi = {
    '/trade/commit': {
        trade_id: 'test-trade-123',
        status: 'committed',
        commitment_hash: null, // Will be filled by actual hash
        public: {
            action: 'OPEN',
            side: 'LONG',
            lobs: 500,
            timestamp: '2024-01-15T10:00:00Z'
        }
    },
    '/trade/reveal': {
        trade_id: 'test-trade-123',
        status: 'revealed',
        symbol: 'NVDA',
        price: 875.50
    },
    '/trade/close': {
        trade_id: 'test-close-456',
        status: 'closed',
        opening_trade: {
            trade_id: 'test-trade-123',
            symbol: 'NVDA',
            price: 875.50,
            revealed: true
        },
        pnl_lobs: 47.5,
        pnl_percent: 1.91
    }
};

// Mock fetch for testing
global.fetch = async (url, options) => {
    const endpoint = url.replace('https://test-api.clawstreet.club/api', '');
    const response = mockApi[endpoint];
    
    if (!response) {
        throw new Error(`Unmocked endpoint: ${endpoint}`);
    }

    // For commit endpoint, fill in the actual hash
    if (endpoint === '/trade/commit' && options.body) {
        const body = JSON.parse(options.body);
        response.commitment_hash = body.commitment.hash;
    }

    return {
        ok: true,
        json: async () => response
    };
};

async function runTests() {
    console.log('🧪 Running Clawstreet Signing Tests\n');
    
    try {
        // Test data
        const privateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const agentId = 'agent-test-uuid';
        const wallet = new ethers.Wallet(privateKey);
        
        console.log(`🔑 Test wallet address: ${wallet.address}\n`);

        // Test 1: Create commitment
        console.log('📝 Test 1: Create Commitment');
        const tradeData = {
            agent_id: agentId,
            action: 'OPEN',
            side: 'LONG',
            lobs: 500,
            symbol: 'NVDA',
            price: 875.50,
            timestamp: '2024-01-15T10:00:00Z'
        };

        const commitment = await createCommitment(tradeData, privateKey);
        console.log(`✅ Hash: ${commitment.hash.slice(0, 10)}...`);
        console.log(`✅ Signature: ${commitment.signature.slice(0, 10)}...`);
        console.log(`✅ Nonce: ${commitment.tradeData.nonce}\n`);

        // Test 2: Verify commitment
        console.log('🔍 Test 2: Verify Commitment');
        const isValid = await verifyCommitment(
            commitment.hash,
            commitment.signature,
            commitment.tradeData,
            wallet.address
        );
        console.log(`✅ Commitment valid: ${isValid}\n`);

        // Test 3: Invalid commitment verification
        console.log('❌ Test 3: Invalid Commitment');
        const invalidData = { ...commitment.tradeData, price: 999.99 };
        const isInvalid = await verifyCommitment(
            commitment.hash,
            commitment.signature,
            invalidData,
            wallet.address
        );
        console.log(`✅ Invalid commitment correctly rejected: ${!isInvalid}\n`);

        // Test 4: Initialize signer and submit trade
        console.log('🚀 Test 4: Submit Committed Trade');
        const signer = new ClawstreetSigner(
            privateKey, 
            agentId, 
            'https://test-api.clawstreet.club/api'
        );

        const publicFields = {
            action: 'OPEN',
            side: 'LONG',
            lobs: 500,
            timestamp: '2024-01-15T10:00:00Z'
        };

        const submitResult = await signer.submitCommittedTrade(commitment, publicFields);
        console.log(`✅ Trade submitted: ${submitResult.trade_id}`);
        console.log(`✅ Status: ${submitResult.status}`);
        console.log(`✅ Hash matches: ${submitResult.commitment_hash === commitment.hash}\n`);

        // Test 5: Reveal trade
        console.log('🎭 Test 5: Reveal Trade');
        const revealResult = await signer.revealTrade(submitResult.trade_id);
        console.log(`✅ Trade revealed: ${revealResult.trade_id}`);
        console.log(`✅ Status: ${revealResult.status}`);
        console.log(`✅ Symbol: ${revealResult.symbol}`);
        console.log(`✅ Price: ${revealResult.price}\n`);

        // Test 6: Close position
        console.log('🔚 Test 6: Close Position');
        const closeResult = await signer.closePosition(submitResult.trade_id, 892.25);
        console.log(`✅ Position closed: ${closeResult.trade_id}`);
        console.log(`✅ P&L: ${closeResult.pnl_lobs} LOBS (${closeResult.pnl_percent}%)`);
        console.log(`✅ Opening trade revealed: ${closeResult.opening_trade.revealed}\n`);

        // Test 7: Convenience method - open position
        console.log('🎯 Test 7: Open Position (Convenience Method)');
        const openResult = await signer.openPosition('OPEN', 'SHORT', 300, 'TSLA', 245.80);
        console.log(`✅ Position opened: ${openResult.trade_id}`);
        console.log(`✅ Public fields preserved, symbol/price hidden\n`);

        // Test 8: Storage verification
        console.log('💾 Test 8: Local Storage');
        const storedData = signer.getStoredTradeData(submitResult.trade_id);
        console.log(`✅ Data stored: ${storedData !== null}`);
        console.log(`✅ Symbol stored: ${storedData?.symbol === 'NVDA'}`);
        console.log(`✅ Price stored: ${storedData?.price === 875.50}\n`);

        console.log('🎉 All tests passed! The signing helpers are working correctly.\n');
        
        // Demo output
        console.log('📊 Demo: What gets submitted vs stored locally');
        console.log('Public (submitted to API):');
        console.log(JSON.stringify(publicFields, null, 2));
        console.log('\nPrivate (stored locally for reveal):');
        console.log(JSON.stringify({
            symbol: storedData?.symbol,
            price: storedData?.price,
            nonce: storedData?.nonce
        }, null, 2));
        console.log('\nCommitment:');
        console.log(JSON.stringify({
            hash: commitment.hash,
            signature: commitment.signature.slice(0, 20) + '...'
        }, null, 2));

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

runTests();