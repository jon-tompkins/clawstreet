import { NextRequest, NextResponse } from 'next/server'
import { generateAgentName, generateMultipleNames, getRandomQuote, NameStyle } from '@/src/lib/name-generator'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const count = Math.min(parseInt(searchParams.get('count') || '5'), 20)
  const style = (searchParams.get('style') || 'random') as NameStyle

  if (count === 1) {
    return NextResponse.json({
      name: generateAgentName(style),
      quote: getRandomQuote(),
    })
  }

  return NextResponse.json({
    names: generateMultipleNames(count),
    quote: getRandomQuote(),
  })
}
