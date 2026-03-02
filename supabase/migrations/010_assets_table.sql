-- Assets table with price feed configuration
-- Replaces hardcoded COINGECKO_IDS, BINANCE_SYMBOLS, etc in trade/route.ts

CREATE TABLE IF NOT EXISTS assets (
  ticker TEXT PRIMARY KEY,                    -- e.g. 'BTC-USD', 'NVDA'
  name TEXT,                                  -- e.g. 'Bitcoin', 'NVIDIA'
  asset_type TEXT NOT NULL DEFAULT 'crypto',  -- crypto | stock | etf
  
  -- Price feed configuration
  primary_feed TEXT NOT NULL DEFAULT 'coingecko',  -- coingecko | binance | yahoo
  fallback_feed TEXT,                              -- optional fallback
  
  -- Feed-specific identifiers
  coingecko_id TEXT,       -- e.g. 'bitcoin', 'uniswap'
  binance_symbol TEXT,     -- e.g. 'BTCUSDT'
  yahoo_symbol TEXT,       -- e.g. 'BTC-USD', 'NVDA'
  
  -- Price sanity bounds
  min_price NUMERIC DEFAULT 0.0000001,
  max_price NUMERIC DEFAULT 1000000,
  
  -- Status
  enabled BOOLEAN DEFAULT true,
  tradeable BOOLEAN DEFAULT true,
  
  -- Cached price (updated by price refresh job)
  last_price NUMERIC,
  last_price_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_enabled ON assets(enabled) WHERE enabled = true;

-- Seed with top crypto (primary: coingecko since binance is geo-blocked)
INSERT INTO assets (ticker, name, asset_type, primary_feed, coingecko_id, binance_symbol, min_price, max_price) VALUES
  ('BTC-USD', 'Bitcoin', 'crypto', 'coingecko', 'bitcoin', 'BTCUSDT', 1000, 500000),
  ('ETH-USD', 'Ethereum', 'crypto', 'coingecko', 'ethereum', 'ETHUSDT', 100, 50000),
  ('SOL-USD', 'Solana', 'crypto', 'coingecko', 'solana', 'SOLUSDT', 1, 2000),
  ('BNB-USD', 'BNB', 'crypto', 'coingecko', 'binancecoin', 'BNBUSDT', 10, 5000),
  ('XRP-USD', 'XRP', 'crypto', 'coingecko', 'ripple', 'XRPUSDT', 0.01, 100),
  ('ADA-USD', 'Cardano', 'crypto', 'coingecko', 'cardano', 'ADAUSDT', 0.01, 50),
  ('DOGE-USD', 'Dogecoin', 'crypto', 'coingecko', 'dogecoin', 'DOGEUSDT', 0.001, 10),
  ('AVAX-USD', 'Avalanche', 'crypto', 'coingecko', 'avalanche-2', 'AVAXUSDT', 1, 1000),
  ('LINK-USD', 'Chainlink', 'crypto', 'coingecko', 'chainlink', 'LINKUSDT', 0.1, 500),
  ('DOT-USD', 'Polkadot', 'crypto', 'coingecko', 'polkadot', 'DOTUSDT', 0.1, 500),
  ('MATIC-USD', 'Polygon', 'crypto', 'coingecko', 'matic-network', 'MATICUSDT', 0.01, 50),
  ('UNI-USD', 'Uniswap', 'crypto', 'coingecko', 'uniswap', 'UNIUSDT', 0.5, 200),
  ('ATOM-USD', 'Cosmos', 'crypto', 'coingecko', 'cosmos', 'ATOMUSDT', 0.1, 500),
  ('LTC-USD', 'Litecoin', 'crypto', 'coingecko', 'litecoin', 'LTCUSDT', 10, 2000),
  ('NEAR-USD', 'NEAR Protocol', 'crypto', 'coingecko', 'near', 'NEARUSDT', 0.1, 100),
  ('ARB-USD', 'Arbitrum', 'crypto', 'coingecko', 'arbitrum', 'ARBUSDT', 0.1, 50),
  ('OP-USD', 'Optimism', 'crypto', 'coingecko', 'optimism', 'OPUSDT', 0.1, 50),
  ('HBAR-USD', 'Hedera', 'crypto', 'coingecko', 'hedera-hashgraph', 'HBARUSDT', 0.01, 10),
  ('FIL-USD', 'Filecoin', 'crypto', 'coingecko', 'filecoin', 'FILUSDT', 0.1, 500),
  ('AAVE-USD', 'Aave', 'crypto', 'coingecko', 'aave', 'AAVEUSDT', 10, 2000),
  -- Meme coins with appropriate bounds
  ('PEPE-USD', 'Pepe', 'crypto', 'coingecko', 'pepe', 'PEPEUSDT', 0.0000001, 0.001),
  ('BONK-USD', 'Bonk', 'crypto', 'coingecko', 'bonk', 'BONKUSDT', 0.0000001, 0.001),
  ('SHIB-USD', 'Shiba Inu', 'crypto', 'coingecko', 'shiba-inu', 'SHIBUSDT', 0.0000001, 0.01),
  ('FLOKI-USD', 'Floki', 'crypto', 'coingecko', 'floki', 'FLOKIUSDT', 0.0000001, 0.01),
  ('WIF-USD', 'dogwifhat', 'crypto', 'coingecko', 'dogwifcoin', 'WIFUSDT', 0.01, 100),
  -- Major stocks (yahoo primary)
  ('NVDA', 'NVIDIA', 'stock', 'yahoo', NULL, NULL, 10, 5000),
  ('AAPL', 'Apple', 'stock', 'yahoo', NULL, NULL, 50, 1000),
  ('MSFT', 'Microsoft', 'stock', 'yahoo', NULL, NULL, 100, 2000),
  ('GOOGL', 'Alphabet', 'stock', 'yahoo', NULL, NULL, 50, 1000),
  ('META', 'Meta', 'stock', 'yahoo', NULL, NULL, 50, 2000),
  ('TSLA', 'Tesla', 'stock', 'yahoo', NULL, NULL, 10, 2000),
  ('AMD', 'AMD', 'stock', 'yahoo', NULL, NULL, 10, 1000),
  ('PLTR', 'Palantir', 'stock', 'yahoo', NULL, NULL, 1, 500),
  ('SMCI', 'Super Micro', 'stock', 'yahoo', NULL, NULL, 10, 2000),
  ('COIN', 'Coinbase', 'stock', 'yahoo', NULL, NULL, 10, 1000),
  -- ETFs
  ('SPY', 'S&P 500 ETF', 'etf', 'yahoo', NULL, NULL, 100, 2000),
  ('QQQ', 'Nasdaq 100 ETF', 'etf', 'yahoo', NULL, NULL, 100, 2000),
  ('IWM', 'Russell 2000 ETF', 'etf', 'yahoo', NULL, NULL, 50, 1000),
  ('URA', 'Uranium ETF', 'etf', 'yahoo', NULL, NULL, 5, 200),
  ('XLE', 'Energy ETF', 'etf', 'yahoo', NULL, NULL, 20, 500),
  ('GLD', 'Gold ETF', 'etf', 'yahoo', NULL, NULL, 50, 1000),
  ('TLT', 'Treasury Bond ETF', 'etf', 'yahoo', NULL, NULL, 50, 500)
ON CONFLICT (ticker) DO NOTHING;

COMMENT ON TABLE assets IS 'Asset registry with price feed configuration. Primary source of truth for tradeable assets.';
