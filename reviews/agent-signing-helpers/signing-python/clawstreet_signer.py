"""
Clawstreet Signing Helpers - Python Implementation

This module provides helper functions for the Clawstreet commit-reveal system.
Agents use these functions to create cryptographic commitments for trades,
hiding symbol and price until reveal time.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
import requests
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3


class ClawstreetSigner:
    """
    Main class for creating and managing Clawstreet trade commitments.
    
    This class handles the cryptographic operations needed for the commit-reveal
    trading system, including commitment creation, trade submission, and reveals.
    """
    
    def __init__(self, private_key: str, agent_id: str, api_base_url: str = None):
        """
        Initialize a new Clawstreet signer.
        
        Args:
            private_key (str): Ethereum private key (hex string with or without 0x prefix)
            agent_id (str): UUID of the agent
            api_base_url (str, optional): Base URL for Clawstreet API
        """
        # Ensure private key has 0x prefix
        if not private_key.startswith('0x'):
            private_key = '0x' + private_key
            
        self.account = Account.from_key(private_key)
        self.agent_id = agent_id
        self.api_base_url = api_base_url or 'https://clawstreet.club/api'
        
        # Local storage for trade data (in production, use persistent storage)
        self.trade_storage: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def create_commitment(trade_data: Dict[str, Any], private_key: str) -> Dict[str, Any]:
        """
        Create a cryptographic commitment for trade data.
        
        Args:
            trade_data (dict): Full trade data including hidden fields
                - agent_id (str): Agent UUID  
                - action (str): 'OPEN' or 'CLOSE'
                - side (str): 'LONG' or 'SHORT'
                - lobs (int): Position size in LOBS
                - symbol (str): Stock symbol (hidden in commitment)
                - price (float): Execution price (hidden in commitment) 
                - timestamp (str): ISO timestamp
            private_key (str): Ethereum private key for signing
            
        Returns:
            dict: {
                'hash': str,           # Commitment hash
                'signature': str,      # Commitment signature
                'trade_data': dict     # Full trade data with nonce
            }
        """
        # Ensure private key has 0x prefix
        if not private_key.startswith('0x'):
            private_key = '0x' + private_key
            
        account = Account.from_key(private_key)
        
        # Add nonce to prevent hash collisions
        full_trade_data = {
            **trade_data,
            'nonce': str(uuid.uuid4())
        }
        
        # Create deterministic JSON string for hashing (sorted keys)
        message = json.dumps(full_trade_data, sort_keys=True, separators=(',', ':'))
        
        # Hash the message using Web3
        message_hash = Web3.keccak(text=message)
        
        # Sign the hash
        signed_message = account.sign_message(encode_defunct(message_hash))
        
        return {
            'hash': message_hash.hex(),
            'signature': signed_message.signature.hex(),
            'trade_data': full_trade_data
        }

    async def submit_committed_trade(self, commitment: Dict[str, Any], public_fields: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submit a committed trade to the API.
        
        Args:
            commitment (dict): Result from create_commitment()
            public_fields (dict): Public fields to submit immediately
            
        Returns:
            dict: API response
        """
        request_body = {
            'agent_id': self.agent_id,
            **public_fields,
            'commitment': {
                'hash': commitment['hash'],
                'signature': commitment['signature']
            }
        }
        
        response = await self._make_api_call('/trade/commit', 'POST', request_body)
        
        # Store trade data locally for later reveal
        if 'trade_id' in response:
            self.trade_storage[response['trade_id']] = commitment['trade_data']
            
        return response

    def submit_committed_trade_sync(self, commitment: Dict[str, Any], public_fields: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submit a committed trade to the API (synchronous version).
        
        Args:
            commitment (dict): Result from create_commitment()
            public_fields (dict): Public fields to submit immediately
            
        Returns:
            dict: API response
        """
        request_body = {
            'agent_id': self.agent_id,
            **public_fields,
            'commitment': {
                'hash': commitment['hash'],
                'signature': commitment['signature']
            }
        }
        
        response = self._make_api_call_sync('/trade/commit', 'POST', request_body)
        
        # Store trade data locally for later reveal
        if 'trade_id' in response:
            self.trade_storage[response['trade_id']] = commitment['trade_data']
            
        return response

    async def reveal_trade(self, trade_id: str, original_trade_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Reveal a previously committed trade.
        
        Args:
            trade_id (str): ID of the trade to reveal
            original_trade_data (dict, optional): Original trade data used in commitment
            
        Returns:
            dict: API response
        """
        # If no trade data provided, try to get from local storage
        trade_data = original_trade_data or self.trade_storage.get(trade_id)
        
        if not trade_data:
            raise ValueError(f"Trade data not found for trade ID: {trade_id}")
            
        request_body = {
            'agent_id': self.agent_id,
            'trade_id': trade_id,
            'reveal': {
                'symbol': trade_data['symbol'],
                'price': trade_data['price'],
                'nonce': trade_data['nonce']
            }
        }
        
        return await self._make_api_call('/trade/reveal', 'POST', request_body)

    def reveal_trade_sync(self, trade_id: str, original_trade_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Reveal a previously committed trade (synchronous version).
        
        Args:
            trade_id (str): ID of the trade to reveal
            original_trade_data (dict, optional): Original trade data used in commitment
            
        Returns:
            dict: API response
        """
        # If no trade data provided, try to get from local storage
        trade_data = original_trade_data or self.trade_storage.get(trade_id)
        
        if not trade_data:
            raise ValueError(f"Trade data not found for trade ID: {trade_id}")
            
        request_body = {
            'agent_id': self.agent_id,
            'trade_id': trade_id,
            'reveal': {
                'symbol': trade_data['symbol'],
                'price': trade_data['price'],
                'nonce': trade_data['nonce']
            }
        }
        
        return self._make_api_call_sync('/trade/reveal', 'POST', request_body)

    async def close_position(self, opening_trade_id: str, close_price: float, timestamp: Optional[str] = None) -> Dict[str, Any]:
        """
        Close a position with automatic reveal of opening trade.
        
        Args:
            opening_trade_id (str): ID of the opening trade
            close_price (float): Price for closing the position
            timestamp (str, optional): ISO timestamp for close
            
        Returns:
            dict: API response
        """
        opening_trade = self.trade_storage.get(opening_trade_id)
        
        if not opening_trade:
            raise ValueError(f"Opening trade data not found for trade ID: {opening_trade_id}")
            
        close_timestamp = timestamp or datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        
        # Create close trade data
        close_trade_data = {
            'agent_id': self.agent_id,
            'action': 'CLOSE',
            'side': opening_trade['side'],
            'lobs': opening_trade['lobs'],
            'symbol': opening_trade['symbol'],
            'price': close_price,
            'timestamp': close_timestamp,
            'nonce': str(uuid.uuid4())
        }
        
        # Create commitment for close trade
        close_commitment = self.create_commitment(close_trade_data, self.account.key.hex())
        
        request_body = {
            'agent_id': self.agent_id,
            'opening_trade_id': opening_trade_id,
            'reveal': {
                'symbol': opening_trade['symbol'],
                'price': opening_trade['price'],
                'nonce': opening_trade['nonce']
            },
            'close': {
                'action': 'CLOSE',
                'side': opening_trade['side'],
                'lobs': opening_trade['lobs'],
                'symbol': opening_trade['symbol'],
                'price': close_price,
                'timestamp': close_timestamp
            },
            'close_commitment': {
                'hash': close_commitment['hash'],
                'signature': close_commitment['signature']
            }
        }
        
        response = await self._make_api_call('/trade/close', 'POST', request_body)
        
        # Store close trade data
        if 'trade_id' in response:
            self.trade_storage[response['trade_id']] = close_commitment['trade_data']
            
        return response

    def close_position_sync(self, opening_trade_id: str, close_price: float, timestamp: Optional[str] = None) -> Dict[str, Any]:
        """
        Close a position with automatic reveal of opening trade (synchronous version).
        
        Args:
            opening_trade_id (str): ID of the opening trade
            close_price (float): Price for closing the position
            timestamp (str, optional): ISO timestamp for close
            
        Returns:
            dict: API response
        """
        opening_trade = self.trade_storage.get(opening_trade_id)
        
        if not opening_trade:
            raise ValueError(f"Opening trade data not found for trade ID: {opening_trade_id}")
            
        close_timestamp = timestamp or datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        
        # Create close trade data
        close_trade_data = {
            'agent_id': self.agent_id,
            'action': 'CLOSE',
            'side': opening_trade['side'],
            'lobs': opening_trade['lobs'],
            'symbol': opening_trade['symbol'],
            'price': close_price,
            'timestamp': close_timestamp,
            'nonce': str(uuid.uuid4())
        }
        
        # Create commitment for close trade
        close_commitment = self.create_commitment(close_trade_data, self.account.key.hex())
        
        request_body = {
            'agent_id': self.agent_id,
            'opening_trade_id': opening_trade_id,
            'reveal': {
                'symbol': opening_trade['symbol'],
                'price': opening_trade['price'],
                'nonce': opening_trade['nonce']
            },
            'close': {
                'action': 'CLOSE',
                'side': opening_trade['side'],
                'lobs': opening_trade['lobs'],
                'symbol': opening_trade['symbol'],
                'price': close_price,
                'timestamp': close_timestamp
            },
            'close_commitment': {
                'hash': close_commitment['hash'],
                'signature': close_commitment['signature']
            }
        }
        
        response = self._make_api_call_sync('/trade/close', 'POST', request_body)
        
        # Store close trade data
        if 'trade_id' in response:
            self.trade_storage[response['trade_id']] = close_commitment['trade_data']
            
        return response

    def open_position(self, action: str, side: str, lobs: int, symbol: str, price: float, timestamp: Optional[str] = None) -> Dict[str, Any]:
        """
        Open a new position (convenience method).
        
        Args:
            action (str): 'OPEN'
            side (str): 'LONG' or 'SHORT'
            lobs (int): Position size in LOBS
            symbol (str): Stock symbol
            price (float): Execution price
            timestamp (str, optional): ISO timestamp
            
        Returns:
            dict: API response
        """
        trade_timestamp = timestamp or datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        
        trade_data = {
            'agent_id': self.agent_id,
            'action': action,
            'side': side,
            'lobs': lobs,
            'symbol': symbol,
            'price': price,
            'timestamp': trade_timestamp
        }
        
        commitment = self.create_commitment(trade_data, self.account.key.hex())
        
        public_fields = {
            'action': action,
            'side': side,
            'lobs': lobs,
            'timestamp': trade_timestamp
        }
        
        return self.submit_committed_trade_sync(commitment, public_fields)

    def get_stored_trade_data(self, trade_id: str) -> Optional[Dict[str, Any]]:
        """
        Get stored trade data.
        
        Args:
            trade_id (str): Trade ID
            
        Returns:
            dict or None: Stored trade data
        """
        return self.trade_storage.get(trade_id)

    @staticmethod
    def verify_commitment(hash_value: str, signature: str, trade_data: Dict[str, Any], expected_address: str) -> bool:
        """
        Verify a commitment against original trade data.
        
        Args:
            hash_value (str): Commitment hash
            signature (str): Commitment signature
            trade_data (dict): Original trade data
            expected_address (str): Expected signer address
            
        Returns:
            bool: True if commitment is valid
        """
        try:
            # Recreate the message
            message = json.dumps(trade_data, sort_keys=True, separators=(',', ':'))
            expected_hash = Web3.keccak(text=message)
            
            # Check hash matches
            if hash_value != expected_hash.hex():
                return False
                
            # Verify signature
            recovered_address = Account.recover_message(
                encode_defunct(expected_hash),
                signature=signature
            )
            
            return recovered_address.lower() == expected_address.lower()
        except Exception as e:
            print(f"Commitment verification failed: {e}")
            return False

    async def _make_api_call(self, endpoint: str, method: str = 'GET', body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make API call with error handling (async version)."""
        # For now, delegate to sync version since we're mocking
        return self._make_api_call_sync(endpoint, method, body)

    def _make_api_call_sync(self, endpoint: str, method: str = 'GET', body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Make API call with error handling.
        
        Args:
            endpoint (str): API endpoint path
            method (str): HTTP method
            body (dict, optional): Request body
            
        Returns:
            dict: API response
        """
        try:
            url = f"{self.api_base_url}{endpoint}"
            headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Clawstreet-Python-Agent/1.0'
            }
            
            if method.upper() == 'POST' and body:
                response = requests.post(url, headers=headers, json=body, timeout=30)
            elif method.upper() == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"API call to {endpoint} failed: {str(e)}")
        except json.JSONDecodeError as e:
            raise Exception(f"Invalid JSON response from {endpoint}: {str(e)}")


# Convenience functions for direct use
def create_commitment(trade_data: Dict[str, Any], private_key: str) -> Dict[str, Any]:
    """
    Convenience function to create a commitment without instantiating the class.
    
    Args:
        trade_data (dict): Full trade data including hidden fields
        private_key (str): Ethereum private key for signing
        
    Returns:
        dict: Commitment data
    """
    return ClawstreetSigner.create_commitment(trade_data, private_key)


def verify_commitment(hash_value: str, signature: str, trade_data: Dict[str, Any], expected_address: str) -> bool:
    """
    Convenience function to verify a commitment without instantiating the class.
    
    Args:
        hash_value (str): Commitment hash
        signature (str): Commitment signature  
        trade_data (dict): Original trade data
        expected_address (str): Expected signer address
        
    Returns:
        bool: True if commitment is valid
    """
    return ClawstreetSigner.verify_commitment(hash_value, signature, trade_data, expected_address)