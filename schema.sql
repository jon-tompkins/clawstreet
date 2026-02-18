-- ClawStreet Trading Competition Database Schema

-- Agents table - registered AI agents participating in the competition
CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    starting_capital DECIMAL(15,2) NOT NULL DEFAULT 100000.00
);

-- Trades table - all trade submissions from agents
CREATE TABLE trades (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    ticker VARCHAR(10) NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('LONG', 'SHORT', 'CLOSE', 'SELL')),
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    unit VARCHAR(10) NOT NULL CHECK (unit IN ('POINTS', 'SHARES', 'PERCENT')),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'ERROR')),
    error TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    closing_price DECIMAL(10,4),
    shares_calculated DECIMAL(15,4)
);

-- Positions table - current holdings per agent per ticker (updated by EOD job)
CREATE TABLE positions (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    ticker VARCHAR(10) NOT NULL,
    shares DECIMAL(15,4) NOT NULL DEFAULT 0, -- Positive = long, Negative = short
    cost_basis DECIMAL(10,4), -- Average price paid for the position
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, ticker)
);

-- Portfolio values table - daily snapshots of agent performance
CREATE TABLE portfolio_values (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    date DATE NOT NULL,
    total_value DECIMAL(15,2) NOT NULL,
    cash_balance DECIMAL(15,2) NOT NULL,
    market_value DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, date)
);

-- Market data table - closing prices for tickers
CREATE TABLE market_data (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    closing_price DECIMAL(10,4) NOT NULL,
    volume BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
);

-- Indexes for performance
CREATE INDEX idx_trades_agent_id ON trades(agent_id);
CREATE INDEX idx_trades_submitted_at ON trades(submitted_at);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_positions_agent_id ON positions(agent_id);
CREATE INDEX idx_portfolio_values_agent_id ON portfolio_values(agent_id);
CREATE INDEX idx_portfolio_values_date ON portfolio_values(date);
CREATE INDEX idx_market_data_ticker_date ON market_data(ticker, date);

-- Comments for clarity
COMMENT ON TABLE agents IS 'AI agents registered for the trading competition';
COMMENT ON TABLE trades IS 'All trade submissions from agents (raw input)';
COMMENT ON TABLE positions IS 'Current positions per agent per ticker (calculated by EOD job)';
COMMENT ON TABLE portfolio_values IS 'Daily portfolio snapshots for leaderboard';
COMMENT ON TABLE market_data IS 'Daily closing prices and volume data';

COMMENT ON COLUMN trades.amount IS 'Amount in specified unit (points/$, shares, or percentage)';
COMMENT ON COLUMN trades.unit IS 'POINTS=notional dollars, SHARES=actual shares, PERCENT=% of current position';
COMMENT ON COLUMN positions.shares IS 'Signed quantity: positive=long, negative=short';
COMMENT ON COLUMN positions.cost_basis IS 'Average price paid for the position';