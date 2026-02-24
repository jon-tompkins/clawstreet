-- =====================================================
-- MARKET HOLIDAYS - US market closure dates
-- =====================================================

CREATE TABLE IF NOT EXISTS market_holidays (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    name VARCHAR(100),
    market VARCHAR(20) DEFAULT 'NYSE', -- NYSE, NASDAQ, etc.
    early_close TIME,  -- NULL = full day closed, time = early close
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Public read access
ALTER TABLE market_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Holidays are publicly readable" ON market_holidays FOR SELECT USING (true);

-- 2026 US Market Holidays (NYSE)
INSERT INTO market_holidays (date, name, early_close) VALUES
('2026-01-01', 'New Year''s Day', NULL),
('2026-01-19', 'Martin Luther King Jr. Day', NULL),
('2026-02-16', 'Presidents'' Day', NULL),
('2026-04-03', 'Good Friday', NULL),
('2026-05-25', 'Memorial Day', NULL),
('2026-06-19', 'Juneteenth', NULL),
('2026-07-03', 'Independence Day (observed)', NULL),
('2026-09-07', 'Labor Day', NULL),
('2026-11-26', 'Thanksgiving', NULL),
('2026-11-27', 'Day after Thanksgiving', '13:00'),  -- Early close
('2026-12-24', 'Christmas Eve', '13:00'),  -- Early close
('2026-12-25', 'Christmas Day', NULL)
ON CONFLICT (date) DO NOTHING;

-- 2027 holidays (plan ahead)
INSERT INTO market_holidays (date, name, early_close) VALUES
('2027-01-01', 'New Year''s Day', NULL),
('2027-01-18', 'Martin Luther King Jr. Day', NULL),
('2027-02-15', 'Presidents'' Day', NULL),
('2027-04-16', 'Good Friday', NULL),
('2027-05-31', 'Memorial Day', NULL),
('2027-06-18', 'Juneteenth (observed)', NULL),
('2027-07-05', 'Independence Day (observed)', NULL),
('2027-09-06', 'Labor Day', NULL),
('2027-11-25', 'Thanksgiving', NULL),
('2027-11-26', 'Day after Thanksgiving', '13:00'),
('2027-12-24', 'Christmas Day (observed)', NULL)
ON CONFLICT (date) DO NOTHING;

-- Update is_trading_open function to check holidays
CREATE OR REPLACE FUNCTION is_trading_open(ticker_symbol VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    t tickers%ROWTYPE;
    h market_holidays%ROWTYPE;
    now_in_tz TIMESTAMPTZ;
    today_date DATE;
    now_time TIME;
BEGIN
    SELECT * INTO t FROM tickers WHERE symbol = ticker_symbol;
    
    -- Unknown ticker = allow (fail open)
    IF NOT FOUND THEN RETURN true; END IF;
    
    -- Crypto = always open
    IF t.asset_type = 'crypto' OR t.market_open IS NULL THEN 
        RETURN true; 
    END IF;
    
    -- Get current time in market timezone
    now_in_tz := NOW() AT TIME ZONE COALESCE(t.timezone, 'America/New_York');
    today_date := now_in_tz::DATE;
    now_time := now_in_tz::TIME;
    
    -- Check if today is a holiday
    SELECT * INTO h FROM market_holidays WHERE date = today_date;
    IF FOUND THEN
        -- Full day closed
        IF h.early_close IS NULL THEN RETURN false; END IF;
        -- Early close day
        IF now_time > h.early_close THEN RETURN false; END IF;
    END IF;
    
    -- Check weekend
    IF EXTRACT(DOW FROM now_in_tz) IN (0, 6) THEN RETURN false; END IF;
    
    -- Check market hours
    RETURN now_time >= t.market_open AND now_time <= t.market_close;
END;
$$ LANGUAGE plpgsql;

-- Verify
SELECT date, name, COALESCE(early_close::TEXT, 'Closed') as status 
FROM market_holidays 
WHERE date >= CURRENT_DATE 
ORDER BY date 
LIMIT 10;
