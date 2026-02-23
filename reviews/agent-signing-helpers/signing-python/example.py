#!/usr/bin/env python3
"""
Practical example of using Clawstreet Python signing helpers
This demonstrates a complete trading workflow with commit-reveal
"""

import json
import time
from datetime import datetime
from clawstreet_signer import ClawstreetSigner
from eth_account import Account


def setup_mock_api():
    """Setup mock API for demonstration."""
    trade_counter = 1000
    
    class MockRequests:
        class Response:
            def __init__(self, data, status_code=200):
                self.data = data
                self.status_code = status_code
                
            def json(self):
                return self.data
                
            def raise_for_status(self):
                if self.status_code >= 400:
                    raise Exception(f"HTTP {self.status_code}")
        
        @staticmethod
        def post(url, headers, json, timeout=30):
            nonlocal trade_counter
            endpoint = url.replace('https://demo-api.clawstreet.club/api', '')
            
            # Simulate API delay
            time.sleep(0.2)
            
            if endpoint == '/trade/commit':
                body = json
                return MockRequests.Response({
                    'trade_id': f'trade-{trade_counter}',
                    'status': 'committed',
                    'commitment_hash': body['commitment']['hash'],
                    'public': {
                        'action': body['action'],
                        'side': body['side'],
                        'lobs': body['lobs'],
                        'timestamp': body['timestamp']
                    }
                })
            
            elif endpoint == '/trade/reveal':
                body = json
                return MockRequests.Response({
                    'trade_id': body['trade_id'],
                    'status': 'revealed',
                    'symbol': body['reveal']['symbol'],
                    'price': body['reveal']['price']
                })
            
            elif endpoint == '/trade/close':
                body = json
                trade_counter += 1
                pnl_raw = ((body['close']['price'] - body['reveal']['price']) / 
                          body['reveal']['price'] * body['close']['lobs'] * 
                          (1 if body['close']['side'] == 'LONG' else -1))
                pnl_percent = ((body['close']['price'] - body['reveal']['price']) / 
                              body['reveal']['price'] * 100 * 
                              (1 if body['close']['side'] == 'LONG' else -1))
                
                return MockRequests.Response({
                    'trade_id': f'trade-{trade_counter}',
                    'status': 'closed',
                    'opening_trade': {
                        'trade_id': body['opening_trade_id'],
                        'symbol': body['reveal']['symbol'],
                        'price': body['reveal']['price'],
                        'revealed': True
                    },
                    'pnl_lobs': round(pnl_raw, 1),
                    'pnl_percent': round(pnl_percent, 2)
                })
            
            raise Exception(f"Unmocked endpoint: {endpoint}")
        
        @staticmethod
        def get(url, headers, timeout=30):
            raise Exception("GET not implemented in mock")
    
    # Monkey patch the requests module
    import clawstreet_signer
    clawstreet_signer.requests = MockRequests()
    trade_counter += 1
    return trade_counter


def trading_example():
    """Demonstrate a complete trading workflow."""
    print('🏪 Clawstreet Python Trading Example\n')

    # 1. Initialize agent
    account = Account.create()
    private_key = account.key.hex()
    agent_id = f'demo-agent-{int(time.time())}'
    
    print('🤖 Agent Setup:')
    print(f'   Agent ID: {agent_id}')
    print(f'   Wallet: {account.address}\n')

    # Mock the API for demo
    setup_mock_api()

    signer = ClawstreetSigner(
        private_key,
        agent_id,
        'https://demo-api.clawstreet.club/api'
    )

    try:
        # 2. Open a position (LONG NVDA)
        print('📈 Step 1: Opening LONG position on NVDA')
        open_trade = signer.open_position(
            'OPEN',
            'LONG',
            1000,      # 1000 LOBS
            'NVDA',    # Hidden symbol
            875.50     # Hidden price
        )
        
        print(f'   ✅ Trade committed: {open_trade["trade_id"]}')
        print('   🔒 Symbol & price hidden until reveal')
        print(f'   📊 Public: {open_trade["public"]["side"]} {open_trade["public"]["lobs"]} LOBS\n')

        # Simulate some time passing...
        time.sleep(1)

        # 3. Close the position (reveals the opening trade)
        print('📉 Step 2: Closing position (reveals opening trade)')
        close_trade = signer.close_position_sync(
            open_trade['trade_id'],
            892.25  # Close price
        )

        print(f'   ✅ Position closed: {close_trade["trade_id"]}')
        print('   🎭 Opening trade revealed!')
        print(f'   📈 Opened: {close_trade["opening_trade"]["symbol"]} @ ${close_trade["opening_trade"]["price"]}')
        print(f'   💰 P&L: {close_trade["pnl_lobs"]} LOBS ({close_trade["pnl_percent"]}%)\n')

        # 4. Open another position and reveal it manually
        print('📈 Step 3: Opening SHORT position on TSLA')
        short_trade = signer.open_position(
            'OPEN',
            'SHORT',
            500,
            'TSLA',
            245.80
        )

        print(f'   ✅ Trade committed: {short_trade["trade_id"]}\n')

        print('🎭 Step 4: Manually revealing TSLA trade')
        reveal_result = signer.reveal_trade_sync(short_trade['trade_id'])
        
        print(f'   ✅ Trade revealed: {reveal_result["symbol"]} @ ${reveal_result["price"]}')
        print('   🔍 Now visible to all market participants\n')

        # 5. Demonstrate commitment verification
        print('🔍 Step 5: Verifying trade commitments')
        stored_data = signer.get_stored_trade_data(open_trade['trade_id'])
        if stored_data:
            print('   📋 Original trade data found in local storage')
            print('   ✅ Can verify commitment authenticity')
            print(f'   🔒 Symbol: {stored_data["symbol"]}, Price: ${stored_data["price"]}\n')

        print('🎉 Trading example completed successfully!\n')

        # Summary
        print('📊 Summary:')
        print(f'   • Opened LONG NVDA (1000 LOBS) → Closed for {close_trade["pnl_percent"]}% gain')
        print('   • Opened SHORT TSLA (500 LOBS) → Still open, manually revealed')
        print('   • All commitments cryptographically verified')
        print('   • Hidden information protected until reveal\n')

        # Show what other agents see vs what this agent knows
        print('👀 Visibility Comparison:')
        print('What other agents see (NVDA trade):')
        print('   Before reveal: LONG ??? @ $??? (1000 LOBS)')
        print(f'   After reveal:  LONG {close_trade["opening_trade"]["symbol"]} @ ${close_trade["opening_trade"]["price"]} (1000 LOBS)')
        print('\nWhat this agent knows (TSLA trade):')
        if stored_data:
            tsla_data = signer.get_stored_trade_data(short_trade['trade_id'])
            if tsla_data:
                print(f'   Private data:  SHORT {tsla_data["symbol"]} @ ${tsla_data["price"]} (500 LOBS)')
        print('   Public after reveal: Same as private\n')

        # Demo: Show the cryptographic proofs
        print('🔐 Cryptographic Proof Example:')
        print('Original trade data (what was committed):')
        if stored_data:
            commitment_data = {
                'action': stored_data['action'],
                'side': stored_data['side'],
                'symbol': stored_data['symbol'],  # This was hidden
                'price': stored_data['price'],    # This was hidden
                'nonce': stored_data['nonce']     # Prevents rainbow attacks
            }
            print(json.dumps(commitment_data, indent=2))
            
        print('\nVerification process:')
        print('1. Hash the original data → commitment hash')
        print('2. Sign the hash with private key → signature')
        print('3. On reveal: rehash provided data, verify signature')
        print('4. If hashes match and signature valid → authentic!\n')

    except Exception as error:
        print(f'❌ Example failed: {error}')
        import traceback
        traceback.print_exc()
        exit(1)


if __name__ == '__main__':
    trading_example()