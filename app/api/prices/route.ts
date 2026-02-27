import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export const dynamic = 'force-dynamic'

// Cache prices for 60 seconds
let priceCache: Record<string, { price: number; change: number; timestamp: number }> = {}
const CACHE_TTL = 60 * 1000

// Crypto tickers that should use CoinGecko
const CRYPTO_TICKERS = [
  'BTC-USD', 'ETH-USD', 'BNB-USD', 'XRP-USD', 'SOL-USD',
  'ADA-USD', 'DOGE-USD', 'TRX-USD', 'AVAX-USD', 'LINK-USD',
  'DOT-USD', 'MATIC-USD', 'TON11419-USD', 'SHIB-USD', 'LTC-USD',
  'BCH-USD', 'UNI-USD', 'LEO-USD', 'XLM-USD', 'ATOM-USD',
  'XMR-USD', 'ETC-USD', 'OKB-USD', 'FIL-USD', 'HBAR-USD',
  'NEAR-USD', 'ARB-USD', 'VET-USD', 'APT-USD', 'MKR-USD',
  'OP-USD', 'INJ-USD', 'GRT-USD', 'AAVE-USD', 'ALGO-USD',
  'RUNE-USD', 'FTM-USD', 'QNT-USD', 'THETA-USD', 'KAS-USD',
  'RENDER-USD', 'IMX-USD', 'CRO-USD', 'FLOW-USD', 'AXS-USD',
  'SAND-USD', 'MANA-USD', 'EGLD-USD', 'XTZ-USD', 'CHZ-USD',
  'NEO-USD', 'KAVA-USD', 'IOTA-USD', 'ZEC-USD', 'CAKE-USD',
  'EOS-USD', 'SNX-USD', 'ROSE-USD', 'XDC-USD', 'MINA-USD',
  'GALA-USD', 'ENJ-USD', 'CRV-USD', 'LDO-USD', '1INCH-USD',
  'COMP-USD', 'LRC-USD', 'ENS-USD', 'BAT-USD', 'ZRX-USD',
  'YFI-USD', 'SUSHI-USD', 'CELO-USD', 'ANKR-USD', 'STORJ-USD',
  'SKL-USD', 'AUDIO-USD', 'RLC-USD', 'NKN-USD', 'BAND-USD',
  'OCEAN-USD', 'FET-USD', 'AGIX-USD', 'RNDR-USD', 'MASK-USD',
  'API3-USD', 'SSV-USD', 'GMX-USD', 'DYDX-USD', 'PENDLE-USD',
  'STX-USD', 'SUI-USD', 'SEI-USD', 'TIA-USD', 'JUP-USD',
  'WIF-USD', 'BONK-USD', 'PEPE-USD', 'FLOKI-USD', 'ORDI-USD',
]

// CoinGecko ID mapping
const COINGECKO_IDS: Record<string, string> = {
  'BTC-USD': 'bitcoin',
  'ETH-USD': 'ethereum',
  'BNB-USD': 'binancecoin',
  'XRP-USD': 'ripple',
  'SOL-USD': 'solana',
  'ADA-USD': 'cardano',
  'DOGE-USD': 'dogecoin',
  'TRX-USD': 'tron',
  'AVAX-USD': 'avalanche-2',
  'LINK-USD': 'chainlink',
  'DOT-USD': 'polkadot',
  'MATIC-USD': 'matic-network',
  'TON11419-USD': 'the-open-network',
  'SHIB-USD': 'shiba-inu',
  'LTC-USD': 'litecoin',
  'BCH-USD': 'bitcoin-cash',
  'UNI-USD': 'uniswap',
  'LEO-USD': 'leo-token',
  'XLM-USD': 'stellar',
  'ATOM-USD': 'cosmos',
  'XMR-USD': 'monero',
  'ETC-USD': 'ethereum-classic',
  'OKB-USD': 'okb',
  'FIL-USD': 'filecoin',
  'HBAR-USD': 'hedera-hashgraph',
  'NEAR-USD': 'near',
  'ARB-USD': 'arbitrum',
  'VET-USD': 'vechain',
  'APT-USD': 'aptos',
  'MKR-USD': 'maker',
  'OP-USD': 'optimism',
  'INJ-USD': 'injective-protocol',
  'GRT-USD': 'the-graph',
  'AAVE-USD': 'aave',
  'ALGO-USD': 'algorand',
  'RUNE-USD': 'thorchain',
  'FTM-USD': 'fantom',
  'QNT-USD': 'quant-network',
  'THETA-USD': 'theta-token',
  'KAS-USD': 'kaspa',
  'RENDER-USD': 'render-token',
  'IMX-USD': 'immutable-x',
  'CRO-USD': 'crypto-com-chain',
  'FLOW-USD': 'flow',
  'AXS-USD': 'axie-infinity',
  'SAND-USD': 'the-sandbox',
  'MANA-USD': 'decentraland',
  'EGLD-USD': 'elrond-erd-2',
  'XTZ-USD': 'tezos',
  'CHZ-USD': 'chiliz',
  'NEO-USD': 'neo',
  'KAVA-USD': 'kava',
  'IOTA-USD': 'iota',
  'ZEC-USD': 'zcash',
  'CAKE-USD': 'pancakeswap-token',
  'EOS-USD': 'eos',
  'SNX-USD': 'havven',
  'ROSE-USD': 'oasis-network',
  'XDC-USD': 'xdce-crowd-sale',
  'MINA-USD': 'mina-protocol',
  'GALA-USD': 'gala',
  'ENJ-USD': 'enjincoin',
  'CRV-USD': 'curve-dao-token',
  'LDO-USD': 'lido-dao',
  '1INCH-USD': '1inch',
  'COMP-USD': 'compound-governance-token',
  'LRC-USD': 'loopring',
  'ENS-USD': 'ethereum-name-service',
  'BAT-USD': 'basic-attention-token',
  'ZRX-USD': '0x',
  'YFI-USD': 'yearn-finance',
  'SUSHI-USD': 'sushi',
  'CELO-USD': 'celo',
  'ANKR-USD': 'ankr',
  'STORJ-USD': 'storj',
  'SKL-USD': 'skale',
  'AUDIO-USD': 'audius',
  'RLC-USD': 'iexec-rlc',
  'NKN-USD': 'nkn',
  'BAND-USD': 'band-protocol',
  'OCEAN-USD': 'ocean-protocol',
  'FET-USD': 'fetch-ai',
  'AGIX-USD': 'singularitynet',
  'RNDR-USD': 'render-token',
  'MASK-USD': 'mask-network',
  'API3-USD': 'api3',
  'SSV-USD': 'ssv-network',
  'GMX-USD': 'gmx',
  'DYDX-USD': 'dydx',
  'PENDLE-USD': 'pendle',
  'STX-USD': 'blockstack',
  'SUI-USD': 'sui',
  'SEI-USD': 'sei-network',
  'TIA-USD': 'celestia',
  'JUP-USD': 'jupiter-exchange-solana',
  'WIF-USD': 'dogwifcoin',
  'BONK-USD': 'bonk',
  'PEPE-USD': 'pepe',
  'FLOKI-USD': 'floki',
  'ORDI-USD': 'ordinals',
}

// Fetch crypto prices from CoinGecko
async function getCryptoPrices(symbols: string[]): Promise<Record<string, number>> {
  const geckoIds = symbols
    .map(s => COINGECKO_IDS[s.toUpperCase()])
    .filter(Boolean)
  
  if (geckoIds.length === 0) return {}
  
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds.join(',')}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 30 } }
    )
    const data = await res.json()
    
    const results: Record<string, number> = {}
    for (const symbol of symbols) {
      const geckoId = COINGECKO_IDS[symbol.toUpperCase()]
      if (geckoId && data[geckoId]?.usd) {
        results[symbol.toUpperCase()] = data[geckoId].usd
      }
    }
    return results
  } catch (err) {
    console.error('CoinGecko error:', err)
    return {}
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get('symbols')?.split(',').filter(Boolean) || []
  
  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No symbols provided' }, { status: 400 })
  }
  
  if (symbols.length > 50) {
    return NextResponse.json({ error: 'Max 50 symbols' }, { status: 400 })
  }
  
  const now = Date.now()
  const results: Record<string, { price: number; change: number; cached: boolean }> = {}
  const toFetchCrypto: string[] = []
  const toFetchStock: string[] = []
  
  // Check cache and categorize
  for (const symbol of symbols) {
    const upperSymbol = symbol.toUpperCase()
    const cached = priceCache[upperSymbol]
    if (cached && now - cached.timestamp < CACHE_TTL) {
      results[upperSymbol] = { price: cached.price, change: cached.change, cached: true }
    } else if (CRYPTO_TICKERS.includes(upperSymbol)) {
      toFetchCrypto.push(upperSymbol)
    } else {
      toFetchStock.push(upperSymbol)
    }
  }
  
  // Fetch crypto from CoinGecko
  if (toFetchCrypto.length > 0) {
    const cryptoPrices = await getCryptoPrices(toFetchCrypto)
    for (const symbol of toFetchCrypto) {
      const price = cryptoPrices[symbol]
      if (price) {
        priceCache[symbol] = { price, change: 0, timestamp: now }
        results[symbol] = { price, change: 0, cached: false }
      }
    }
  }
  
  // Fetch stocks from Yahoo Finance
  if (toFetchStock.length > 0) {
    try {
      const quotes = await yahooFinance.quote(toFetchStock)
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes]
      
      for (const quote of quotesArray) {
        if (quote && quote.symbol && quote.regularMarketPrice) {
          const price = quote.regularMarketPrice
          const change = quote.regularMarketChangePercent || 0
          
          priceCache[quote.symbol] = { price, change, timestamp: now }
          results[quote.symbol] = { price, change, cached: false }
        }
      }
    } catch (err) {
      console.error('Yahoo Finance error:', err)
    }
  }
  
  return NextResponse.json({
    prices: results,
    timestamp: new Date().toISOString()
  })
}

// POST - fetch historical prices for a date range
export async function POST(request: NextRequest) {
  try {
    const { symbols, from, to } = await request.json()
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array required' }, { status: 400 })
    }
    
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const toDate = to ? new Date(to) : new Date()
    
    const results: Record<string, any[]> = {}
    
    for (const symbol of symbols.slice(0, 20)) {
      try {
        const history = await yahooFinance.historical(symbol, {
          period1: fromDate,
          period2: toDate,
          interval: '1d'
        })
        results[symbol] = history.map(h => ({
          date: h.date.toISOString().split('T')[0],
          close: h.close,
          volume: h.volume
        }))
      } catch (err) {
        console.error(`Error fetching history for ${symbol}:`, err)
        results[symbol] = []
      }
    }
    
    return NextResponse.json({ history: results })
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
