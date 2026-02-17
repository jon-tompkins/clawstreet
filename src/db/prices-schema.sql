-- Price Storage Schema
-- Run in Supabase SQL Editor

-- Daily closing prices
CREATE TABLE prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  open_price DECIMAL(12,4),
  high_price DECIMAL(12,4),
  low_price DECIMAL(12,4),
  close_price DECIMAL(12,4) NOT NULL,
  volume BIGINT,
  source VARCHAR(50) DEFAULT 'polygon',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(ticker, date)
);

-- Index for fast lookups
CREATE INDEX idx_prices_ticker_date ON prices(ticker, date DESC);
CREATE INDEX idx_prices_date ON prices(date);

-- RLS
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

-- Anyone can read prices
CREATE POLICY "Public can read prices" ON prices
  FOR SELECT USING (true);

-- Only service role can write
CREATE POLICY "Service role can write prices" ON prices
  FOR ALL USING (auth.role() = 'service_role');

-- Function to get latest price for a ticker
CREATE OR REPLACE FUNCTION get_latest_price(p_ticker VARCHAR)
RETURNS TABLE(ticker VARCHAR, date DATE, close_price DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT p.ticker, p.date, p.close_price
  FROM prices p
  WHERE p.ticker = p_ticker
  ORDER BY p.date DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
