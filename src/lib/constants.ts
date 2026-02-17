// Clawstreet Constants

export const GAME_CONFIG = {
  STARTING_POINTS: 1_000_000,
  ENTRY_FEE_USD: 10,
  MAX_TRADES_PER_DAY: 10,
  WEEKLY_DECAY: 0.01, // 1%
  
  // Market cap filter (USD)
  MIN_MARKET_CAP: 500_000_000,
  MIN_AVG_VOLUME: 1_000_000,
  MIN_PRICE: 5,
} as const;

export const SCHEDULE = {
  // All times in ET
  TRADE_CUTOFF_HOUR: 15, // 3:30 PM
  TRADE_CUTOFF_MINUTE: 30,
  PRICING_HOUR: 23, // 11:30 PM
  PRICING_MINUTE: 30,
  REVEAL_DAY: 5, // Friday (0 = Sunday)
} as const;

export const ACTIONS = ['BUY', 'SELL', 'SHORT', 'COVER'] as const;
export type TradeAction = typeof ACTIONS[number];
