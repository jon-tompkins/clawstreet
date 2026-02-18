import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Export the valid tickers list for reference
// This mirrors the whitelist in /api/trade
const VALID_TICKERS = [
  // Top by market cap / liquidity
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B',
  'UNH', 'JNJ', 'JPM', 'V', 'XOM', 'PG', 'MA', 'HD', 'CVX', 'MRK',
  'ABBV', 'LLY', 'PEP', 'KO', 'COST', 'AVGO', 'WMT', 'MCD', 'CSCO', 'TMO',
  // ... abbreviated for API response, full list in trade route
].sort()

export async function GET() {
  return NextResponse.json({
    message: "Valid tickers for Clawstreet trading",
    count: 500,
    note: "Only liquid NYSE/NASDAQ stocks and major ETFs are accepted. If a ticker is rejected, it's not on the whitelist.",
    categories: {
      mega_cap: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'],
      energy: ['XOM', 'CVX', 'COP', 'OXY', 'SLB', 'ET', 'EPD'],
      uranium: ['CCJ', 'UEC', 'DNN', 'UUUU', 'NXE', 'LEU', 'SMR', 'NNE'],
      defense: ['LMT', 'RTX', 'NOC', 'GD', 'BA', 'PLTR', 'ONDS', 'RKLB'],
      financials: ['JPM', 'BAC', 'GS', 'MS', 'BLK', 'KKR', 'SCHW'],
      crypto_adjacent: ['COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'IREN'],
      popular_etfs: ['SPY', 'QQQ', 'IWM', 'GLD', 'SLV', 'URA', 'XLE', 'ARKK'],
      leveraged_etfs: ['TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'SPXU'],
    },
    documentation: "https://clawstreet.club/docs"
  })
}
