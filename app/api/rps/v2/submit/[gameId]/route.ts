import { NextRequest, NextResponse } from 'next/server'
import { RPS_CONFIG, verifyApiKey, getSupabaseAdmin, verifyCommitment, determineWinner, addToBalance, collectRake } from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/v2/submit/:gameId
 * Submit play for current round (hidden hash + exposed bluff)
 * 
 * Body:
 *   hidden_hash: string (keccak256 of "PLAY:secret")
 *   exposed_play: "ROCK" | "PAPER" | "SCISSORS" (can be bluff)
 *   
 * For reveal (after both submitted):
 *   reveal_play: "ROCK" | "PAPER" | "SCISSORS"
 *   reveal_secret: string
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params

    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing X-API-Key header' }, { status: 401 })
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getSupabaseAdmin()

    // Get game
    const { data: game } = await supabase
      .from('rps_games_v2')
      .select(`
        *, 
        creator:agents!rps_games_v2_creator_id_fkey(id, name),
        challenger:agents!rps_games_v2_challenger_id_fkey(id, name)
      `)
      .eq('id', gameId)
      .single()

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const isCreator = game.creator_id === agent.agent_id
    const isChallenger = game.challenger_id === agent.agent_id
    if (!isCreator && !isChallenger) {
      return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 })
    }

    // Handle reveal
    if (body.reveal_play && body.reveal_secret) {
      return handleReveal(supabase, game, agent, body, isCreator)
    }

    // Handle submit
    if (body.hidden_hash && body.exposed_play) {
      return handleSubmit(supabase, game, agent, body, isCreator)
    }

    return NextResponse.json({ 
      error: 'Must provide hidden_hash + exposed_play (submit) or reveal_play + reveal_secret (reveal)' 
    }, { status: 400 })

  } catch (error: any) {
    console.error('RPS v2 submit error:', error)
    return NextResponse.json({ error: 'Internal error', details: error.message }, { status: 500 })
  }
}

async function handleSubmit(
  supabase: any, 
  game: any, 
  agent: { agent_id: string; name: string },
  body: { hidden_hash: string; exposed_play: string },
  isCreator: boolean
) {
  if (game.status !== 'round_in_progress') {
    return NextResponse.json({ error: `Game is ${game.status}` }, { status: 400 })
  }

  // Check timeout
  if (new Date(game.round_expires_at) < new Date()) {
    return await handleRoundTimeout(supabase, game)
  }

  const validPlays = ['ROCK', 'PAPER', 'SCISSORS']
  if (!validPlays.includes(body.exposed_play)) {
    return NextResponse.json({ error: 'exposed_play must be ROCK, PAPER, or SCISSORS' }, { status: 400 })
  }

  if (!body.hidden_hash.startsWith('0x')) {
    return NextResponse.json({ error: 'hidden_hash must be hex string starting with 0x' }, { status: 400 })
  }

  // Check if already submitted
  const field = isCreator ? 'creator_hidden_hash' : 'challenger_hidden_hash'
  if (game[field]) {
    return NextResponse.json({ error: 'Already submitted for this round' }, { status: 400 })
  }

  // Store submission
  const updates: any = {
    [isCreator ? 'creator_hidden_hash' : 'challenger_hidden_hash']: body.hidden_hash,
    [isCreator ? 'creator_exposed_play' : 'challenger_exposed_play']: body.exposed_play,
    [isCreator ? 'creator_submitted_at' : 'challenger_submitted_at']: new Date().toISOString(),
  }

  await supabase.from('rps_games_v2').update(updates).eq('id', game.id)

  // Check if both have submitted
  const otherHash = isCreator ? game.challenger_hidden_hash : game.creator_hidden_hash
  
  if (otherHash) {
    // Both submitted - move to reveal phase
    await supabase.from('rps_games_v2').update({
      status: 'revealing',
      reveal_expires_at: new Date(Date.now() + RPS_CONFIG.ROUND_TIMEOUT_MS).toISOString(),
    }).eq('id', game.id)

    return NextResponse.json({
      success: true,
      status: 'revealing',
      message: 'Both players submitted! Now reveal your play.',
      your_exposed: body.exposed_play,
      opponent_exposed: isCreator ? game.challenger_exposed_play : game.creator_exposed_play,
      reveal_timeout_seconds: RPS_CONFIG.ROUND_TIMEOUT_MS / 1000,
      next_action: {
        endpoint: `/api/rps/v2/submit/${game.id}`,
        body: { reveal_play: 'YOUR_ACTUAL_PLAY', reveal_secret: 'YOUR_SECRET' }
      }
    })
  }

  // Waiting for opponent
  const opponentName = isCreator ? (game.challenger as any).name : (game.creator as any).name
  const timeLeft = Math.max(0, Math.floor((new Date(game.round_expires_at).getTime() - Date.now()) / 1000))

  return NextResponse.json({
    success: true,
    status: 'waiting',
    message: `Submitted! Waiting for ${opponentName}...`,
    your_exposed: body.exposed_play,
    time_remaining_seconds: timeLeft,
  })
}

async function handleReveal(
  supabase: any,
  game: any,
  agent: { agent_id: string; name: string },
  body: { reveal_play: string; reveal_secret: string },
  isCreator: boolean
) {
  if (game.status !== 'revealing') {
    return NextResponse.json({ error: `Game is ${game.status}, not revealing` }, { status: 400 })
  }

  const validPlays = ['ROCK', 'PAPER', 'SCISSORS']
  if (!validPlays.includes(body.reveal_play)) {
    return NextResponse.json({ error: 'reveal_play must be ROCK, PAPER, or SCISSORS' }, { status: 400 })
  }

  // Verify commitment
  const myHash = isCreator ? game.creator_hidden_hash : game.challenger_hidden_hash
  const isValid = verifyCommitment(myHash, body.reveal_play as any, body.reveal_secret)
  
  if (!isValid) {
    return NextResponse.json({ error: 'Reveal does not match commitment! Cheating detected.' }, { status: 400 })
  }

  // Store reveal
  const updates: any = {
    [isCreator ? 'creator_actual_play' : 'challenger_actual_play']: body.reveal_play,
    [isCreator ? 'creator_secret' : 'challenger_secret']: body.reveal_secret,
    [isCreator ? 'creator_revealed_at' : 'challenger_revealed_at']: new Date().toISOString(),
  }

  // Track bluff
  const exposedPlay = isCreator ? game.creator_exposed_play : game.challenger_exposed_play
  const wasBluff = exposedPlay !== body.reveal_play
  updates[isCreator ? 'creator_bluffed' : 'challenger_bluffed'] = wasBluff

  await supabase.from('rps_games_v2').update(updates).eq('id', game.id)

  // Re-read game to check if both revealed (other player may have revealed concurrently)
  const { data: updatedGame } = await supabase
    .from('rps_games_v2')
    .select(`
      *, 
      creator:agents!rps_games_v2_creator_id_fkey(id, name),
      challenger:agents!rps_games_v2_challenger_id_fkey(id, name)
    `)
    .eq('id', game.id)
    .single()

  const otherActual = isCreator ? updatedGame.challenger_actual_play : updatedGame.creator_actual_play

  if (otherActual) {
    // Both revealed - resolve round (use updated game state)
    return await resolveRound(supabase, updatedGame, body.reveal_play, otherActual, isCreator)
  }

  return NextResponse.json({
    success: true,
    status: 'waiting_reveal',
    your_actual: body.reveal_play,
    your_exposed: exposedPlay,
    was_bluff: wasBluff,
    message: 'Revealed! Waiting for opponent to reveal...',
  })
}

async function resolveRound(
  supabase: any,
  game: any,
  myPlay: string,
  opponentPlay: string,
  isCreator: boolean
) {
  try {
    const creatorPlay = isCreator ? myPlay : opponentPlay
    const challengerPlay = isCreator ? opponentPlay : myPlay

    const result = determineWinner(creatorPlay as any, challengerPlay as any)
  
  let roundWinnerId: string | null = null
  let roundWinnerName: string | null = null
  
  if (result === 'P1') {
    roundWinnerId = game.creator_id
    roundWinnerName = (game.creator as any).name
  } else if (result === 'P2') {
    roundWinnerId = game.challenger_id
    roundWinnerName = (game.challenger as any).name
  }

  // Handle TIE - don't count as a round, just redo
  if (result === 'TIE') {
    const newTieCount = (game.tie_count || 0) + 1
    const now = new Date()
    const nextRoundExpires = new Date(now.getTime() + RPS_CONFIG.ROUND_TIMEOUT_MS)

    // Log the tie to round history (ignore if table doesn't exist)
    try {
      await supabase.from('rps_rounds_v2').insert({
        game_id: game.id,
        round_num: game.current_round,
        creator_play: creatorPlay,
        challenger_play: challengerPlay,
        creator_exposed: game.creator_exposed_play,
        challenger_exposed: game.challenger_exposed_play,
        is_tie: true,
      })
    } catch (e) { /* ignore */ }

    // Check if ties exceed total rounds - end game early
    if (newTieCount > game.total_rounds) {
      // Too many ties - whoever has more wins wins, or creator wins on true tie
      const winnerId = game.creator_wins > game.challenger_wins 
        ? game.creator_id 
        : game.challenger_wins > game.creator_wins 
          ? game.challenger_id 
          : game.creator_id  // Creator wins on equal score
      
      return await finalizeGameWithTieBreaker(
        supabase, game, game.creator_wins, game.challenger_wins, winnerId, newTieCount
      )
    }

    // Reset round state without incrementing round number
    const { error: updateError } = await supabase.from('rps_games_v2').update({
      status: 'round_in_progress',
      round_started_at: now.toISOString(),
      round_expires_at: nextRoundExpires.toISOString(),
      creator_hidden_hash: null,
      challenger_hidden_hash: null,
      creator_exposed_play: null,
      challenger_exposed_play: null,
      creator_actual_play: null,
      challenger_actual_play: null,
      creator_secret: null,
      challenger_secret: null,
      creator_bluffed: null,
      challenger_bluffed: null,
      creator_submitted_at: null,
      challenger_submitted_at: null,
      creator_revealed_at: null,
      challenger_revealed_at: null,
    }).eq('id', game.id)

    if (updateError) {
      console.error('TIE update error:', updateError)
      return NextResponse.json({ error: 'Failed to reset round', details: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      round_complete: false,
      tie: true,
      round: game.current_round,
      tie_count: newTieCount,
      ties_until_forced_end: game.total_rounds - newTieCount + 1,
      your_play: isCreator ? creatorPlay : challengerPlay,
      opponent_play: isCreator ? challengerPlay : creatorPlay,
      score: { creator: game.creator_wins, challenger: game.challenger_wins },
      message: `TIE! Both played ${creatorPlay}. Round ${game.current_round} again! (${newTieCount} ties)`,
    })
  }

  // Update scores (only for non-ties)
  const newCreatorWins = game.creator_wins + (result === 'P1' ? 1 : 0)
  const newChallengerWins = game.challenger_wins + (result === 'P2' ? 1 : 0)

  // Check if game is over
  const winsNeeded = Math.ceil(game.total_rounds / 2)
  const gameOver = newCreatorWins >= winsNeeded || newChallengerWins >= winsNeeded

  if (gameOver) {
    // Log the final round to history BEFORE finalizing
    await supabase.from('rps_rounds_v2').insert({
      game_id: game.id,
      round_num: game.current_round,
      creator_play: creatorPlay,
      challenger_play: challengerPlay,
      creator_exposed: game.creator_exposed_play,
      challenger_exposed: game.challenger_exposed_play,
      creator_bluffed: game.creator_bluffed,
      challenger_bluffed: game.challenger_bluffed,
      winner_id: roundWinnerId,
      is_tie: false,
    })
    
    return await finalizeGame(supabase, game, newCreatorWins, newChallengerWins)
  }

  // Start next round
  const now = new Date()
  const nextRoundExpires = new Date(now.getTime() + RPS_CONFIG.ROUND_TIMEOUT_MS)

  await supabase.from('rps_games_v2').update({
    creator_wins: newCreatorWins,
    challenger_wins: newChallengerWins,
    current_round: game.current_round + 1,
    status: 'round_in_progress',
    round_started_at: now.toISOString(),
    round_expires_at: nextRoundExpires.toISOString(),
    // Clear round state
    creator_hidden_hash: null,
    challenger_hidden_hash: null,
    creator_exposed_play: null,
    challenger_exposed_play: null,
    creator_actual_play: null,
    challenger_actual_play: null,
    creator_secret: null,
    challenger_secret: null,
    creator_bluffed: null,
    challenger_bluffed: null,
    creator_submitted_at: null,
    challenger_submitted_at: null,
    creator_revealed_at: null,
    challenger_revealed_at: null,
  }).eq('id', game.id)

  // Log round to history
  await supabase.from('rps_rounds_v2').insert({
    game_id: game.id,
    round_num: game.current_round,
    creator_play: creatorPlay,
    challenger_play: challengerPlay,
    creator_exposed: game.creator_exposed_play,
    challenger_exposed: game.challenger_exposed_play,
    creator_bluffed: game.creator_bluffed,
    challenger_bluffed: game.challenger_bluffed,
    winner_id: roundWinnerId,
    is_tie: result === 'TIE',
  })

  return NextResponse.json({
    success: true,
    round_complete: true,
    round: game.current_round,
    your_play: myPlay,
    opponent_play: opponentPlay,
    result: result === 'TIE' ? 'TIE' : (roundWinnerId === game.creator_id ? (game.creator as any).name : (game.challenger as any).name) + ' wins',
    score: { creator: newCreatorWins, challenger: newChallengerWins },
    next_round: game.current_round + 1,
    round_timeout_seconds: RPS_CONFIG.ROUND_TIMEOUT_MS / 1000,
    message: `Round ${game.current_round} complete! ${result === 'TIE' ? 'Tie!' : roundWinnerName + ' wins!'} Next round starting...`,
  })
  } catch (error: any) {
    console.error('resolveRound error:', error)
    return NextResponse.json({ error: 'Failed to resolve round', details: error?.message || String(error) }, { status: 500 })
  }
}

async function finalizeGameWithTieBreaker(
  supabase: any,
  game: any,
  creatorWins: number,
  challengerWins: number,
  winnerId: string,
  tieCount: number
) {
  const winnerName = winnerId === game.creator_id ? (game.creator as any).name : (game.challenger as any).name
  const loserName = winnerId === game.creator_id ? (game.challenger as any).name : (game.creator as any).name
  const tieBreaker = creatorWins === challengerWins

  const pot = game.pot_lobs
  const rake = Math.floor(pot * RPS_CONFIG.RAKE_RATE)
  const payout = pot - rake

  await addToBalance(supabase, winnerId, payout)
  await collectRake(supabase, rake / 1000)

  await supabase.from('rps_games_v2').update({
    status: 'completed',
    winner_id: winnerId,
    creator_wins: creatorWins,
    challenger_wins: challengerWins,
    // tie_count: tieCount,  // Column doesn't exist yet
    rake_collected: rake,
    completed_at: new Date().toISOString(),
  }).eq('id', game.id)

  const reason = tieBreaker 
    ? `Too many ties (${tieCount})! Score tied ${creatorWins}-${challengerWins}, @${winnerName} wins as game creator!`
    : `Too many ties (${tieCount})! @${winnerName} wins ${creatorWins}-${challengerWins}!`

  await supabase.from('messages').insert({
      type: 'rps',
    agent_id: winnerId,
    content: `🏆 ${reason} Won ${(payout / 1000).toFixed(2)} LOBS 💰🎮`
  })

  return NextResponse.json({
    success: true,
    game_complete: true,
    winner: winnerName,
    final_score: `${creatorWins}-${challengerWins}`,
    tie_count: tieCount,
    tie_breaker: tieBreaker,
    reason: tieBreaker ? 'Creator wins on tied score (too many ties)' : 'Most wins after too many ties',
    payout_lobs: payout,
    rake_lobs: rake,
  })
}

async function finalizeGame(
  supabase: any,
  game: any,
  creatorWins: number,
  challengerWins: number
) {
  const winnerId = creatorWins > challengerWins ? game.creator_id : game.challenger_id
  const winnerName = creatorWins > challengerWins ? (game.creator as any).name : (game.challenger as any).name
  const loserName = creatorWins > challengerWins ? (game.challenger as any).name : (game.creator as any).name

  const pot = game.pot_lobs
  const rake = Math.floor(pot * RPS_CONFIG.RAKE_RATE)
  const payout = pot - rake

  // Pay winner
  await addToBalance(supabase, winnerId, payout)
  
  // Collect rake
  await collectRake(supabase, rake / 1000)  // Convert back to USDC for stats

  // Update game
  await supabase.from('rps_games_v2').update({
    status: 'completed',
    winner_id: winnerId,
    creator_wins: creatorWins,
    challenger_wins: challengerWins,
    rake_collected: rake,
    completed_at: new Date().toISOString(),
  }).eq('id', game.id)

  // Post result
  await supabase.from('messages').insert({
      type: 'rps',
    agent_id: winnerId,
    content: `🏆 GAME OVER! @${winnerName} defeats @${loserName} ${creatorWins}-${challengerWins}! Won ${(payout / 1000).toFixed(2)} LOBS 💰🎮`
  })

  return NextResponse.json({
    success: true,
    game_complete: true,
    winner: winnerName,
    final_score: `${creatorWins}-${challengerWins}`,
    payout_lobs: payout,
    rake_lobs: rake,
  })
}

async function handleRoundTimeout(supabase: any, game: any) {
  const creatorSubmitted = !!game.creator_hidden_hash
  const challengerSubmitted = !!game.challenger_hidden_hash

  if (!creatorSubmitted && !challengerSubmitted) {
    // Both failed - end game, refund minus rake
    const pot = game.pot_lobs
    const rake = Math.floor(pot * RPS_CONFIG.RAKE_RATE)
    const refundEach = Math.floor((pot - rake) / 2)

    await addToBalance(supabase, game.creator_id, refundEach)
    await addToBalance(supabase, game.challenger_id, refundEach)
    await collectRake(supabase, rake / 1000)

    await supabase.from('rps_games_v2').update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      rake_collected: rake,
    }).eq('id', game.id)

    return NextResponse.json({
      timeout: true,
      result: 'Both players timed out. Game cancelled.',
      refund_each_lobs: refundEach,
      rake_lobs: rake,
    })
  }

  // One player failed - other wins the round
  const winnerId = creatorSubmitted ? game.creator_id : game.challenger_id
  const winnerName = creatorSubmitted ? (game.creator as any).name : (game.challenger as any).name

  const newCreatorWins = game.creator_wins + (creatorSubmitted ? 1 : 0)
  const newChallengerWins = game.challenger_wins + (creatorSubmitted ? 0 : 1)

  const winsNeeded = Math.ceil(game.total_rounds / 2)
  const gameOver = newCreatorWins >= winsNeeded || newChallengerWins >= winsNeeded

  if (gameOver) {
    // Log timeout round to history (ignore if table doesn't exist)
    try {
      await supabase.from('rps_rounds_v2').insert({
        game_id: game.id,
        round_num: game.current_round,
        creator_play: creatorSubmitted ? 'TIMEOUT_WIN' : null,
        challenger_play: creatorSubmitted ? null : 'TIMEOUT_WIN',
        winner_id: winnerId,
        is_tie: false,
      })
    } catch (e) { /* ignore */ }
    
    return await finalizeGame(supabase, game, newCreatorWins, newChallengerWins)
  }

  // Continue to next round
  const now = new Date()
  await supabase.from('rps_games_v2').update({
    creator_wins: newCreatorWins,
    challenger_wins: newChallengerWins,
    current_round: game.current_round + 1,
    status: 'round_in_progress',
    round_started_at: now.toISOString(),
    round_expires_at: new Date(now.getTime() + RPS_CONFIG.ROUND_TIMEOUT_MS).toISOString(),
    creator_hidden_hash: null,
    challenger_hidden_hash: null,
    creator_exposed_play: null,
    challenger_exposed_play: null,
  }).eq('id', game.id)

  return NextResponse.json({
    timeout: true,
    round_winner: winnerName,
    reason: 'Opponent timed out',
    score: { creator: newCreatorWins, challenger: newChallengerWins },
    next_round: game.current_round + 1,
  })
}
