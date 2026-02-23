-- Daily Decay and Rewards System Migration
-- Run in Supabase SQL editor

-- 1. Create decay_history table to track daily decay events
CREATE TABLE IF NOT EXISTS decay_history (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    amount_lobs DECIMAL(15,2) NOT NULL,
    applied_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, applied_date)
);

-- 2. Add reward_lobs column to agents table (separate from trading P&L)
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS reward_lobs DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_decay_date DATE,
ADD COLUMN IF NOT EXISTS total_fees_paid DECIMAL(15,2) NOT NULL DEFAULT 0;

-- 3. Add fee tracking to trades table
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS fee_lobs DECIMAL(15,2);

-- 4. Create prize_pool_distributions table to track weekly payouts
CREATE TABLE IF NOT EXISTS prize_pool_distributions (
    id SERIAL PRIMARY KEY,
    distribution_date DATE NOT NULL,
    total_pool_lobs DECIMAL(15,2) NOT NULL,
    total_agents INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create agent_rewards table to track individual reward payments
CREATE TABLE IF NOT EXISTS agent_rewards (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER NOT NULL REFERENCES agents(id),
    distribution_id INTEGER NOT NULL REFERENCES prize_pool_distributions(id),
    performance_rank INTEGER NOT NULL,
    reward_lobs DECIMAL(15,2) NOT NULL,
    performance_score DECIMAL(10,4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_decay_history_agent_date ON decay_history(agent_id, applied_date);
CREATE INDEX IF NOT EXISTS idx_decay_history_date ON decay_history(applied_date);
CREATE INDEX IF NOT EXISTS idx_agents_last_decay ON agents(last_decay_date) WHERE last_decay_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prize_distributions_date ON prize_pool_distributions(distribution_date);
CREATE INDEX IF NOT EXISTS idx_agent_rewards_agent ON agent_rewards(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_rewards_distribution ON agent_rewards(distribution_id);

-- 7. Add comments for clarity
COMMENT ON TABLE decay_history IS 'Daily decay events applied to agent balances';
COMMENT ON TABLE prize_pool_distributions IS 'Weekly prize pool distribution events';
COMMENT ON TABLE agent_rewards IS 'Individual reward payments to agents';

COMMENT ON COLUMN agents.reward_lobs IS 'Reward LOBS earned (separate from trading P&L)';
COMMENT ON COLUMN agents.last_decay_date IS 'Last date when daily decay was applied';
COMMENT ON COLUMN agents.total_fees_paid IS 'Total trading fees paid by this agent';
COMMENT ON COLUMN trades.fee_lobs IS 'Trading fee charged for this trade';

-- 8. Create function to calculate daily decay (100 LOBS per agent per day)
CREATE OR REPLACE FUNCTION apply_daily_decay()
RETURNS TABLE(agent_id INTEGER, decay_applied DECIMAL(15,2)) AS $$
DECLARE
    current_date DATE := CURRENT_DATE;
    agent_record RECORD;
    decay_amount DECIMAL(15,2) := 100.00;
BEGIN
    -- Process all active agents who haven't had decay applied today
    FOR agent_record IN 
        SELECT a.id, a.points, a.cash_balance, a.last_decay_date
        FROM agents a 
        WHERE a.status = 'active' 
        AND (a.last_decay_date IS NULL OR a.last_decay_date < current_date)
    LOOP
        -- Apply decay to cash balance first, then points if needed
        IF agent_record.cash_balance >= decay_amount THEN
            -- Sufficient cash balance
            UPDATE agents 
            SET cash_balance = cash_balance - decay_amount,
                last_decay_date = current_date
            WHERE id = agent_record.id;
        ELSE
            -- Need to take from total points
            UPDATE agents 
            SET points = GREATEST(0, points - decay_amount),
                cash_balance = 0,
                last_decay_date = current_date
            WHERE id = agent_record.id;
        END IF;
        
        -- Record the decay event
        INSERT INTO decay_history (agent_id, amount_lobs, applied_date)
        VALUES (agent_record.id, decay_amount, current_date)
        ON CONFLICT (agent_id, applied_date) DO NOTHING;
        
        -- Return the result
        agent_id := agent_record.id;
        decay_applied := decay_amount;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to update weekly prize pool
CREATE OR REPLACE FUNCTION update_prize_pool_balance()
RETURNS DECIMAL(15,2) AS $$
DECLARE
    total_fees DECIMAL(15,2);
    total_decay DECIMAL(15,2);
    pool_balance DECIMAL(15,2);
BEGIN
    -- Calculate total fees from trades
    SELECT COALESCE(SUM(fee_lobs), 0) INTO total_fees
    FROM trades
    WHERE fee_lobs IS NOT NULL;
    
    -- Calculate total decay collected
    SELECT COALESCE(SUM(amount_lobs), 0) INTO total_decay
    FROM decay_history;
    
    -- Total pool balance
    pool_balance := total_fees + total_decay;
    
    RETURN pool_balance;
END;
$$ LANGUAGE plpgsql;