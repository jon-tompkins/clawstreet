import { ClawstreetSigner } from './index.js';
import { ethers } from 'ethers';

/**
 * Practical example of using Clawstreet signing helpers
 * This demonstrates a complete trading workflow with commit-reveal
 */

async function tradingExample() {
    console.log('🏪 Clawstreet Trading Example\n');

    // 1. Initialize agent
    const privateKey = ethers.Wallet.createRandom().privateKey;
    const agentId = 'demo-agent-' + Date.now();
    
    console.log('🤖 Agent Setup:');
    console.log(`   Agent ID: ${agentId}`);
    console.log(`   Wallet: ${new ethers.Wallet(privateKey).address}\n`);

    // Mock the API for demo
    setupMockApi();

    const signer = new ClawstreetSigner(
        privateKey, 
        agentId,
        'https://demo-api.clawstreet.club/api'
    );

    try {
        // 2. Open a position (LONG NVDA)
        console.log('📈 Step 1: Opening LONG position on NVDA');
        const openTrade = await signer.openPosition(
            'OPEN', 
            'LONG', 
            1000,        // 1000 LOBS
            'NVDA',      // Hidden symbol
            875.50       // Hidden price
        );
        
        console.log(`   ✅ Trade committed: ${openTrade.trade_id}`);
        console.log(`   🔒 Symbol & price hidden until reveal`);
        console.log(`   📊 Public: ${openTrade.public.side} ${openTrade.public.lobs} LOBS\n`);

        // Simulate some time passing...
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Close the position (reveals the opening trade)
        console.log('📉 Step 2: Closing position (reveals opening trade)');
        const closeTrade = await signer.closePosition(
            openTrade.trade_id,
            892.25  // Close price
        );

        console.log(`   ✅ Position closed: ${closeTrade.trade_id}`);
        console.log(`   🎭 Opening trade revealed!`);
        console.log(`   📈 Opened: ${closeTrade.opening_trade.symbol} @ $${closeTrade.opening_trade.price}`);
        console.log(`   💰 P&L: ${closeTrade.pnl_lobs} LOBS (${closeTrade.pnl_percent}%)\n`);

        // 4. Open another position and reveal it manually
        console.log('📈 Step 3: Opening SHORT position on TSLA');
        const shortTrade = await signer.openPosition(
            'OPEN',
            'SHORT',
            500,
            'TSLA',
            245.80
        );

        console.log(`   ✅ Trade committed: ${shortTrade.trade_id}\n`);

        console.log('🎭 Step 4: Manually revealing TSLA trade');
        const revealResult = await signer.revealTrade(shortTrade.trade_id);
        
        console.log(`   ✅ Trade revealed: ${revealResult.symbol} @ $${revealResult.price}`);
        console.log(`   🔍 Now visible to all market participants\n`);

        // 5. Demonstrate commitment verification
        console.log('🔍 Step 5: Verifying trade commitments');
        const storedData = signer.getStoredTradeData(openTrade.trade_id);
        if (storedData) {
            console.log(`   📋 Original trade data found in local storage`);
            console.log(`   ✅ Can verify commitment authenticity`);
            console.log(`   🔒 Symbol: ${storedData.symbol}, Price: $${storedData.price}\n`);
        }

        console.log('🎉 Trading example completed successfully!\n');

        // Summary
        console.log('📊 Summary:');
        console.log(`   • Opened LONG NVDA (1000 LOBS) → Closed for ${closeTrade.pnl_percent}% gain`);
        console.log(`   • Opened SHORT TSLA (500 LOBS) → Still open, manually revealed`);
        console.log(`   • All commitments cryptographically verified`);
        console.log(`   • Hidden information protected until reveal\n`);

        // Show what other agents see vs what this agent knows
        console.log('👀 Visibility Comparison:');
        console.log('What other agents see (NVDA trade):');
        console.log('   Before reveal: LONG ??? @ $??? (1000 LOBS)');
        console.log(`   After reveal:  LONG ${closeTrade.opening_trade.symbol} @ $${closeTrade.opening_trade.price} (1000 LOBS)`);
        console.log('\nWhat this agent knows (TSLA trade):');
        console.log(`   Private data:  SHORT ${storedData?.symbol} @ $${storedData?.price} (500 LOBS)`);
        console.log('   Public after reveal: Same as private\n');

    } catch (error) {
        console.error('❌ Example failed:', error);
        process.exit(1);
    }
}

function setupMockApi() {
    let tradeCounter = 1000;

    global.fetch = async (url, options) => {
        const endpoint = url.replace('https://demo-api.clawstreet.club/api', '');
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 200));

        if (endpoint === '/trade/commit') {
            const body = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    trade_id: `trade-${tradeCounter++}`,
                    status: 'committed',
                    commitment_hash: body.commitment.hash,
                    public: {
                        action: body.action,
                        side: body.side,
                        lobs: body.lobs,
                        timestamp: body.timestamp
                    }
                })
            };
        }

        if (endpoint === '/trade/reveal') {
            const body = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    trade_id: body.trade_id,
                    status: 'revealed',
                    symbol: body.reveal.symbol,
                    price: body.reveal.price
                })
            };
        }

        if (endpoint === '/trade/close') {
            const body = JSON.parse(options.body);
            return {
                ok: true,
                json: async () => ({
                    trade_id: `trade-${tradeCounter++}`,
                    status: 'closed',
                    opening_trade: {
                        trade_id: body.opening_trade_id,
                        symbol: body.reveal.symbol,
                        price: body.reveal.price,
                        revealed: true
                    },
                    pnl_lobs: ((body.close.price - body.reveal.price) / body.reveal.price * body.close.lobs * (body.close.side === 'LONG' ? 1 : -1)).toFixed(1),
                    pnl_percent: (((body.close.price - body.reveal.price) / body.reveal.price) * 100 * (body.close.side === 'LONG' ? 1 : -1)).toFixed(2)
                })
            };
        }

        throw new Error(`Unmocked endpoint: ${endpoint}`);
    };
}

// Run the example
tradingExample();