-- Assets table - registry of tradeable assets
-- asset_type determines which price feed to use

CREATE TABLE IF NOT EXISTS assets (
  ticker TEXT PRIMARY KEY,           -- 'BTC-USD', 'NVDA'
  name TEXT,                         -- 'Bitcoin', 'NVIDIA'
  asset_type TEXT NOT NULL,          -- crypto | stock | etf
  
  -- Feed identifiers (used based on asset_type)
  coingecko_id TEXT,                 -- for crypto
  yahoo_symbol TEXT,                 -- for stocks/etfs (defaults to ticker)
  
  -- Price bounds for sanity checks
  min_price NUMERIC DEFAULT 0.0000001,
  max_price NUMERIC DEFAULT 1000000,
  
  -- Status
  enabled BOOLEAN DEFAULT true,
  
  -- Cached price
  last_price NUMERIC,
  last_price_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);

-- Asset type → Price feed mapping (logic in code):
-- crypto → coingecko (using coingecko_id)
-- stock  → yahoo
-- etf    → yahoo

-- Seed top assets
INSERT INTO assets (ticker, name, asset_type, coingecko_id, min_price, max_price) VALUES
  -- Major crypto
  ('BTC-USD', 'Bitcoin', 'crypto', 'bitcoin', 10000, 500000),
  ('ETH-USD', 'Ethereum', 'crypto', 'ethereum', 500, 50000),
  ('SOL-USD', 'Solana', 'crypto', 'solana', 5, 2000),
  ('XRP-USD', 'XRP', 'crypto', 'ripple', 0.1, 100),
  ('ADA-USD', 'Cardano', 'crypto', 'cardano', 0.05, 50),
  ('DOGE-USD', 'Dogecoin', 'crypto', 'dogecoin', 0.01, 10),
  ('AVAX-USD', 'Avalanche', 'crypto', 'avalanche-2', 1, 1000),
  ('LINK-USD', 'Chainlink', 'crypto', 'chainlink', 1, 500),
  ('DOT-USD', 'Polkadot', 'crypto', 'polkadot', 1, 500),
  ('MATIC-USD', 'Polygon', 'crypto', 'matic-network', 0.1, 50),
  ('UNI-USD', 'Uniswap', 'crypto', 'uniswap', 1, 200),
  ('ATOM-USD', 'Cosmos', 'crypto', 'cosmos', 1, 500),
  ('LTC-USD', 'Litecoin', 'crypto', 'litecoin', 20, 2000),
  ('NEAR-USD', 'NEAR', 'crypto', 'near', 0.5, 100),
  ('ARB-USD', 'Arbitrum', 'crypto', 'arbitrum', 0.1, 50),
  ('HBAR-USD', 'Hedera', 'crypto', 'hedera-hashgraph', 0.01, 10),
  ('FIL-USD', 'Filecoin', 'crypto', 'filecoin', 1, 500),
  ('AAVE-USD', 'Aave', 'crypto', 'aave', 20, 2000),
  ('TRX-USD', 'Tron', 'crypto', 'tron', 0.01, 5),
  -- Meme coins
  ('PEPE-USD', 'Pepe', 'crypto', 'pepe', 0.0000001, 0.001),
  ('BONK-USD', 'Bonk', 'crypto', 'bonk', 0.0000001, 0.001),
  ('SHIB-USD', 'Shiba Inu', 'crypto', 'shiba-inu', 0.0000001, 0.01),
  ('WIF-USD', 'dogwifhat', 'crypto', 'dogwifcoin', 0.1, 100),
  ('FLOKI-USD', 'Floki', 'crypto', 'floki', 0.0000001, 0.01)
ON CONFLICT (ticker) DO NOTHING;

INSERT INTO assets (ticker, name, asset_type, min_price, max_price) VALUES
  -- Stocks
  ('NVDA', 'NVIDIA', 'stock', 50, 5000),
  ('AAPL', 'Apple', 'stock', 50, 1000),
  ('MSFT', 'Microsoft', 'stock', 100, 2000),
  ('GOOGL', 'Alphabet', 'stock', 50, 1000),
  ('META', 'Meta', 'stock', 100, 2000),
  ('TSLA', 'Tesla', 'stock', 50, 2000),
  ('AMD', 'AMD', 'stock', 20, 1000),
  ('PLTR', 'Palantir', 'stock', 5, 500),
  ('SMCI', 'Super Micro', 'stock', 20, 2000),
  ('COIN', 'Coinbase', 'stock', 20, 1000),
  -- ETFs
  ('SPY', 'S&P 500', 'etf', 200, 2000),
  ('QQQ', 'Nasdaq 100', 'etf', 200, 2000),
  ('IWM', 'Russell 2000', 'etf', 100, 1000),
  ('URA', 'Uranium', 'etf', 10, 200),
  ('XLE', 'Energy', 'etf', 30, 500),
  ('GLD', 'Gold', 'etf', 100, 1000),
  ('TLT', 'Treasury Bonds', 'etf', 50, 500)
ON CONFLICT (ticker) DO NOTHING;
