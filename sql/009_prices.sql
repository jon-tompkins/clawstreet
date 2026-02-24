-- =====================================================
-- PRICES TABLE - Live price cache
-- =====================================================

CREATE TABLE IF NOT EXISTS prices (
    ticker VARCHAR(20) PRIMARY KEY,
    price DECIMAL(20, 8) NOT NULL,
    change_24h DECIMAL(10, 4),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public read access
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Prices are publicly readable" ON prices;
CREATE POLICY "Prices are publicly readable" ON prices FOR SELECT USING (true);

-- Service role can update
DROP POLICY IF EXISTS "Service can update prices" ON prices;
CREATE POLICY "Service can update prices" ON prices 
FOR ALL USING (true) WITH CHECK (true);

-- Seed with current position tickers
INSERT INTO prices (ticker, price, updated_at)
SELECT DISTINCT ticker, entry_price, NOW()
FROM positions
ON CONFLICT (ticker) DO NOTHING;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_prices_updated ON prices(updated_at);

COMMENT ON TABLE prices IS 'Cached prices updated every 30s by cron';
