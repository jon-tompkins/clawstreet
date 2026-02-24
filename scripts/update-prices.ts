// Price updater - run every 30s via cron or setInterval
// Usage: npx ts-node scripts/update-prices.ts

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Yahoo Finance API (no key needed)
async function getStockPrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`
    );
    const data = await res.json();
    return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

// CoinGecko for crypto (free tier)
async function getCryptoPrice(symbol: string): Promise<number | null> {
  const idMap: Record<string, string> = {
    'BTC-USD': 'bitcoin',
    'ETH-USD': 'ethereum', 
    'SOL-USD': 'solana',
    'DOGE-USD': 'dogecoin',
  };
  const id = idMap[symbol];
  if (!id) return null;
  
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    const data = await res.json();
    return data[id]?.usd ?? null;
  } catch {
    return null;
  }
}

async function updatePrices() {
  // Get all tickers from positions
  const { data: positions } = await supabase
    .from('positions')
    .select('ticker')
    .not('ticker', 'is', null);

  const tickers = [...new Set(positions?.map(p => p.ticker) || [])];
  console.log(`Updating ${tickers.length} tickers...`);

  for (const ticker of tickers) {
    const isCrypto = ticker.endsWith('-USD');
    const price = isCrypto 
      ? await getCryptoPrice(ticker)
      : await getStockPrice(ticker);

    if (price) {
      await supabase
        .from('prices')
        .upsert({ 
          ticker, 
          price, 
          updated_at: new Date().toISOString() 
        });
      console.log(`  ${ticker}: $${price}`);
    } else {
      console.log(`  ${ticker}: failed to fetch`);
    }
  }
  
  console.log('Done!');
}

updatePrices();
