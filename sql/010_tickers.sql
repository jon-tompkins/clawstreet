-- =====================================================
-- TICKERS TABLE - Asset metadata & trading hours
-- =====================================================

CREATE TABLE IF NOT EXISTS tickers (
    symbol VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100),
    asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN ('stock', 'crypto', 'etf')),
    tradeable BOOLEAN DEFAULT true,
    -- Trading hours (NULL = 24/7 for crypto)
    market_open TIME,      -- e.g., '09:30' for NYSE
    market_close TIME,     -- e.g., '16:00' for NYSE  
    timezone VARCHAR(50),  -- e.g., 'America/New_York'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public read access
ALTER TABLE tickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tickers are publicly readable" ON tickers FOR SELECT USING (true);

-- Seed current position tickers
INSERT INTO tickers (symbol, asset_type, market_open, market_close, timezone) VALUES
-- Crypto (24/7)
('BTC-USD', 'crypto', NULL, NULL, NULL),
('ETH-USD', 'crypto', NULL, NULL, NULL),
('SOL-USD', 'crypto', NULL, NULL, NULL),
('DOGE-USD', 'crypto', NULL, NULL, NULL),
-- Stocks (NYSE hours: 9:30-16:00 ET)
('TSLA', 'stock', '09:30', '16:00', 'America/New_York'),
('NVDA', 'stock', '09:30', '16:00', 'America/New_York'),
('PLTR', 'stock', '09:30', '16:00', 'America/New_York'),
('AMD', 'stock', '09:30', '16:00', 'America/New_York'),
('META', 'stock', '09:30', '16:00', 'America/New_York'),
('INTC', 'stock', '09:30', '16:00', 'America/New_York'),
('XOM', 'stock', '09:30', '16:00', 'America/New_York'),
('XLE', 'etf', '09:30', '16:00', 'America/New_York'),
('QQQ', 'etf', '09:30', '16:00', 'America/New_York')
ON CONFLICT (symbol) DO NOTHING;

-- Helper function to check if trading is open
CREATE OR REPLACE FUNCTION is_trading_open(ticker_symbol VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    t tickers%ROWTYPE;
    now_in_tz TIME;
BEGIN
    SELECT * INTO t FROM tickers WHERE symbol = ticker_symbol;
    
    -- Unknown ticker = allow (fail open)
    IF NOT FOUND THEN RETURN true; END IF;
    
    -- Crypto = always open
    IF t.asset_type = 'crypto' OR t.market_open IS NULL THEN 
        RETURN true; 
    END IF;
    
    -- Check market hours in ticker's timezone
    now_in_tz := (NOW() AT TIME ZONE COALESCE(t.timezone, 'America/New_York'))::TIME;
    
    RETURN now_in_tz >= t.market_open AND now_in_tz <= t.market_close;
END;
$$ LANGUAGE plpgsql;

-- Verify
SELECT symbol, asset_type, 
       CASE WHEN market_open IS NULL THEN '24/7' 
            ELSE market_open || '-' || market_close END as hours
FROM tickers ORDER BY asset_type, symbol;
