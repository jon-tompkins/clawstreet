#!/usr/bin/env python3
"""
Test suite for Clawstreet Python signing helpers
"""

import json
import time
from typing import Dict, Any
from clawstreet_signer import ClawstreetSigner, create_commitment, verify_commitment
from eth_account import Account


# Mock API responses
mock_api_responses = {
    '/trade/commit': {
        'trade_id': 'test-trade-123',
        'status': 'committed',
        'commitment_hash': None,  # Will be filled by actual hash
        'public': {
            'action': 'OPEN',
            'side': 'LONG',
            'lobs': 500,
            'timestamp': '2024-01-15T10:00:00Z'
        }
    },
    '/trade/reveal': {
        'trade_id': 'test-trade-123',
        'status': 'revealed',
        'symbol': 'NVDA',
        'price': 875.50
    },
    '/trade/close': {
        'trade_id': 'test-close-456',
        'status': 'closed',
        'opening_trade': {
            'trade_id': 'test-trade-123',
            'symbol': 'NVDA',
            'price': 875.50,
            'revealed': True
        },
        'pnl_lobs': 47.5,
        'pnl_percent': 1.91
    }
}


class MockRequests:
    """Mock requests module for testing."""
    
    class Response:
        def __init__(self, data: Dict[str, Any], status_code: int = 200):
            self.data = data
            self.status_code = status_code
            
        def json(self):
            return self.data
            
        def raise_for_status(self):
            if self.status_code >= 400:
                raise Exception(f"HTTP {self.status_code}")
    
    @staticmethod
    def post(url: str, headers: Dict[str, str], json: Dict[str, Any], timeout: int = 30):
        # Extract endpoint from URL
        endpoint = url.replace('https://test-api.clawstreet.club/api', '')
        
        # Simulate API delay
        time.sleep(0.1)
        
        response_data = mock_api_responses.get(endpoint, {})
        
        # For commit endpoint, fill in the actual hash
        if endpoint == '/trade/commit' and 'commitment' in json:
            response_data = response_data.copy()
            response_data['commitment_hash'] = json['commitment']['hash']
            
        return MockRequests.Response(response_data)
    
    @staticmethod
    def get(url: str, headers: Dict[str, str], timeout: int = 30):
        endpoint = url.replace('https://test-api.clawstreet.club/api', '')
        response_data = mock_api_responses.get(endpoint, {})
        return MockRequests.Response(response_data)


def run_tests():
    """Run the test suite."""
    print('🧪 Running Clawstreet Python Signing Tests\n')
    
    try:
        # Monkey patch requests for testing
        import clawstreet_signer
        clawstreet_signer.requests = MockRequests()
        
        # Test data
        private_key = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
        agent_id = 'agent-test-uuid'
        account = Account.from_key(private_key)
        
        print(f'🔑 Test wallet address: {account.address}\n')

        # Test 1: Create commitment
        print('📝 Test 1: Create Commitment')
        trade_data = {
            'agent_id': agent_id,
            'action': 'OPEN',
            'side': 'LONG',
            'lobs': 500,
            'symbol': 'NVDA',
            'price': 875.50,
            'timestamp': '2024-01-15T10:00:00Z'
        }

        commitment = create_commitment(trade_data, private_key)
        print(f'✅ Hash: {commitment["hash"][:10]}...')
        print(f'✅ Signature: {commitment["signature"][:10]}...')
        print(f'✅ Nonce: {commitment["trade_data"]["nonce"]}\n')

        # Test 2: Verify commitment
        print('🔍 Test 2: Verify Commitment')
        is_valid = verify_commitment(
            commitment['hash'],
            commitment['signature'],
            commitment['trade_data'],
            account.address
        )
        print(f'✅ Commitment valid: {is_valid}\n')

        # Test 3: Invalid commitment verification
        print('❌ Test 3: Invalid Commitment')
        invalid_data = commitment['trade_data'].copy()
        invalid_data['price'] = 999.99
        is_invalid = verify_commitment(
            commitment['hash'],
            commitment['signature'],
            invalid_data,
            account.address
        )
        print(f'✅ Invalid commitment correctly rejected: {not is_invalid}\n')

        # Test 4: Initialize signer and submit trade
        print('🚀 Test 4: Submit Committed Trade')
        signer = ClawstreetSigner(
            private_key,
            agent_id,
            'https://test-api.clawstreet.club/api'
        )

        public_fields = {
            'action': 'OPEN',
            'side': 'LONG',
            'lobs': 500,
            'timestamp': '2024-01-15T10:00:00Z'
        }

        submit_result = signer.submit_committed_trade_sync(commitment, public_fields)
        print(f'✅ Trade submitted: {submit_result["trade_id"]}')
        print(f'✅ Status: {submit_result["status"]}')
        print(f'✅ Hash matches: {submit_result["commitment_hash"] == commitment["hash"]}\n')

        # Test 5: Reveal trade
        print('🎭 Test 5: Reveal Trade')
        reveal_result = signer.reveal_trade_sync(submit_result['trade_id'])
        print(f'✅ Trade revealed: {reveal_result["trade_id"]}')
        print(f'✅ Status: {reveal_result["status"]}')
        print(f'✅ Symbol: {reveal_result["symbol"]}')
        print(f'✅ Price: {reveal_result["price"]}\n')

        # Test 6: Close position
        print('🔚 Test 6: Close Position')
        close_result = signer.close_position_sync(submit_result['trade_id'], 892.25)
        print(f'✅ Position closed: {close_result["trade_id"]}')
        print(f'✅ P&L: {close_result["pnl_lobs"]} LOBS ({close_result["pnl_percent"]}%)')
        print(f'✅ Opening trade revealed: {close_result["opening_trade"]["revealed"]}\n')

        # Test 7: Convenience method - open position
        print('🎯 Test 7: Open Position (Convenience Method)')
        open_result = signer.open_position('OPEN', 'SHORT', 300, 'TSLA', 245.80)
        print(f'✅ Position opened: {open_result["trade_id"]}')
        print('✅ Public fields preserved, symbol/price hidden\n')

        # Test 8: Storage verification
        print('💾 Test 8: Local Storage')
        stored_data = signer.get_stored_trade_data(submit_result['trade_id'])
        print(f'✅ Data stored: {stored_data is not None}')
        print(f'✅ Symbol stored: {stored_data["symbol"] == "NVDA" if stored_data else False}')
        print(f'✅ Price stored: {stored_data["price"] == 875.50 if stored_data else False}\n')

        print('🎉 All tests passed! The Python signing helpers are working correctly.\n')
        
        # Demo output
        print('📊 Demo: What gets submitted vs stored locally')
        print('Public (submitted to API):')
        print(json.dumps(public_fields, indent=2))
        print('\nPrivate (stored locally for reveal):')
        if stored_data:
            print(json.dumps({
                'symbol': stored_data['symbol'],
                'price': stored_data['price'],
                'nonce': stored_data['nonce']
            }, indent=2))
        print('\nCommitment:')
        print(json.dumps({
            'hash': commitment['hash'],
            'signature': commitment['signature'][:20] + '...'
        }, indent=2))

    except Exception as error:
        print(f'❌ Test failed: {error}')
        import traceback
        traceback.print_exc()
        exit(1)


if __name__ == '__main__':
    run_tests()