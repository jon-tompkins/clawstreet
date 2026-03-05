import { NextRequest, NextResponse } from 'next/server'
import { 
  RPS_CONFIG, 
  verifyApiKey, 
  getSupabaseAdmin,
  verifyCommitment,
  determineWinner,
  wasBluff,
  updateRpsStats,
  collectRake,
  addToBalance,
  postRpsResult,
  Play
} from '@/app/lib/rps-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rps/play/:gameId
 * Submit a play (commit or reveal) for the current round
 * 
 * For COMMIT (first action in round):
 *   trash_talk?: string
 *   commitment_hash: string
 * 
 * For REVEAL (after both players committed):
 *   play: "ROCK" | "PAPER" | "SCISSORS"
 *   secret: string
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params
    
    const apiKey = request.headers.get('X-API-Key')
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing X-API-Key header' },
        { status: 401 }
      )
    }

    const agent = await verifyApiKey(apiKey)
    if (!agent) {
      return NextResponse.json(
        { error: 'Invalid API key or inactive agent' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const supabase = getSupabaseAdmin()

    // Get game with players
    const { data: game, error: gameError } = await supabase
      .from('rps_games')
      .select(`
        *,
        creator:agents!rps_games_creator_id_fkey(id, name),
        challenger:agents!rps_games_challenger_id_fkey(id, name)
      `)
      .eq('id', gameId)
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.status !== 'active') {
      return NextResponse.json(
        { error: `Game is ${game.status}, not active` },
        { status: 400 }
      )
    }

    // Verify agent is a player
    const isCreator = game.creator_id === agent.agent_id
    const isChallenger = game.challenger_id === agent.agent_id
    if (!isCreator && !isChallenger) {
      return NextResponse.json(
        { error: 'You are not a player in this game' },
        { status: 403 }
      )
    }

    // Get current round
    const { data: round, error: roundError } = await supabase
      .from('rps_rounds')
      .select('*')
      .eq('game_id', gameId)
      .eq('round_num', game.current_round)
      .single()

    if (roundError || !round) {
      return NextResponse.json({ error: 'Round not found' }, { status: 500 })
    }

    // Get plays for this round
    const { data: plays } = await supabase
      .from('rps_plays')
      .select('*')
      .eq('round_id', round.id)

    const myPlay = plays?.find((p: any) => p.agent_id === agent.agent_id)
    const opponentPlay = plays?.find((p: any) => p.agent_id !== agent.agent_id)

    // Determine action based on round state
    if (body.play && body.secret) {
      // REVEAL action
      return await handleReveal(supabase, game, round, plays || [], agent, body, isCreator)
    } else if (body.commitment_hash) {
      // COMMIT action
      return await handleCommit(supabase, game, round, plays || [], agent, body, isCreator)
    } else {
      return NextResponse.json(
        { error: 'Must provide either commitment_hash (for commit) or play+secret (for reveal)' },
        { status: 400 }
      )
    }

  } catch (error: any) {
    console.error('RPS play error:', error)
    return NextResponse.json(
      { error: 'Failed to process play', details: error.message },
      { status: 500 }
    )
  }
}

async function handleCommit(
  supabase: any,
  game: any,
  round: any,
  plays: any[],
  agent: { agent_id: string; name: string },
  body: { commitment_hash: string; trash_talk?: string },
  isCreator: boolean
) {
  const myExistingPlay = plays.find((p: any) => p.agent_id === agent.agent_id)
  
  if (myExistingPlay) {
    return NextResponse.json(
      { error: 'You have already committed for this round' },
      { status: 400 }
    )
  }

  // Check if it's our turn (alternating first player)
  const isFirstPlayer = round.first_player_id === agent.agent_id
  const firstPlayerCommitted = plays.some((p: any) => p.is_first_player && p.commitment_hash)
  
  if (!isFirstPlayer && !firstPlayerCommitted) {
    return NextResponse.json(
      { error: 'Waiting for first player to commit' },
      { status: 400 }
    )
  }

  // Rate limit - 30s between actions
  if (plays.length > 0) {
    const lastPlay = plays.sort((a: any, b: any) => 
      new Date(b.committed_at).getTime() - new Date(a.committed_at).getTime()
    )[0]
    const timeSince = Date.now() - new Date(lastPlay.committed_at).getTime()
    if (timeSince < RPS_CONFIG.ACTION_DELAY_MS) {
      const waitMs = RPS_CONFIG.ACTION_DELAY_MS - timeSince
      return NextResponse.json(
        { error: `Please wait ${Math.ceil(waitMs / 1000)} seconds before committing` },
        { status: 429 }
      )
    }
  }

  // Insert commitment
  await supabase.from('rps_plays').insert({
    round_id: round.id,
    agent_id: agent.agent_id,
    is_first_player: isFirstPlayer,
    trash_talk: body.trash_talk || null,
    commitment_hash: body.commitment_hash,
  })

  // Update round status
  const newStatus = isFirstPlayer ? 'p1_committed' : 'p2_committed'
  await supabase.from('rps_rounds').update({
    status: newStatus,
    [isFirstPlayer ? 'p1_committed_at' : 'p2_committed_at']: new Date().toISOString(),
  }).eq('id', round.id)

  return NextResponse.json({
    success: true,
    round_id: round.id,
    round_num: round.round_num,
    status: newStatus,
    message: isFirstPlayer 
      ? 'Committed. Waiting for opponent to commit.'
      : 'Both players committed. Submit reveals to complete round.',
  })
}

async function handleReveal(
  supabase: any,
  game: any,
  round: any,
  plays: any[],
  agent: { agent_id: string; name: string },
  body: { play: Play; secret: string },
  isCreator: boolean
) {
  // Both players must have committed
  if (plays.length < 2) {
    return NextResponse.json(
      { error: 'Both players must commit before revealing' },
      { status: 400 }
    )
  }

  const myPlay = plays.find((p: any) => p.agent_id === agent.agent_id)
  const opponentPlay = plays.find((p: any) => p.agent_id !== agent.agent_id)

  if (!myPlay) {
    return NextResponse.json(
      { error: 'You have not committed for this round' },
      { status: 400 }
    )
  }

  if (myPlay.play) {
    return NextResponse.json(
      { error: 'You have already revealed for this round' },
      { status: 400 }
    )
  }

  // Validate play
  const validPlays: Play[] = ['ROCK', 'PAPER', 'SCISSORS']
  if (!validPlays.includes(body.play)) {
    return NextResponse.json(
      { error: 'Invalid play. Must be ROCK, PAPER, or SCISSORS' },
      { status: 400 }
    )
  }

  // Verify commitment
  const isValid = verifyCommitment(myPlay.commitment_hash, body.play, body.secret)
  if (!isValid) {
    return NextResponse.json(
      { error: 'Reveal does not match commitment hash. Cheating detected!' },
      { status: 400 }
    )
  }

  // Update play with reveal
  await supabase.from('rps_plays').update({
    play: body.play,
    secret: body.secret,
    revealed_at: new Date().toISOString(),
  }).eq('id', myPlay.id)

  // Check if opponent has revealed
  if (opponentPlay.play) {
    // Both revealed - determine round winner
    const myIsFirst = myPlay.is_first_player
    const result = myIsFirst 
      ? determineWinner(body.play, opponentPlay.play)
      : determineWinner(opponentPlay.play, body.play)

    let roundWinnerId: string | null = null
    let isTie = false
    
    if (result === 'TIE') {
      isTie = true
    } else if (result === 'P1') {
      roundWinnerId = round.first_player_id
    } else {
      roundWinnerId = plays.find((p: any) => !p.is_first_player)?.agent_id
    }

    // Update round
    await supabase.from('rps_rounds').update({
      winner_id: roundWinnerId,
      is_tie: isTie,
      status: isTie ? 'tied' : 'revealed',
      revealed_at: new Date().toISOString(),
    }).eq('id', round.id)

    // Update game score if not a tie
    if (!isTie && roundWinnerId) {
      const isCreatorWin = roundWinnerId === game.creator_id
      await supabase.from('rps_games').update({
        creator_wins: game.creator_wins + (isCreatorWin ? 1 : 0),
        challenger_wins: game.challenger_wins + (isCreatorWin ? 0 : 1),
      }).eq('id', game.id)

      game.creator_wins += isCreatorWin ? 1 : 0
      game.challenger_wins += isCreatorWin ? 0 : 1
    }

    // Check if game is over
    const winsNeeded = Math.ceil(game.best_of / 2)
    const gameOver = game.creator_wins >= winsNeeded || game.challenger_wins >= winsNeeded

    if (gameOver) {
      return await finalizeGame(supabase, game, plays, agent, body.play, opponentPlay.play, roundWinnerId, isTie)
    } else {
      // Start next round
      return await startNextRound(supabase, game, round, roundWinnerId, isTie, body.play, opponentPlay.play)
    }
  } else {
    // Waiting for opponent to reveal
    return NextResponse.json({
      success: true,
      round_id: round.id,
      your_play: body.play,
      message: 'Revealed. Waiting for opponent to reveal.',
    })
  }
}

async function startNextRound(
  supabase: any,
  game: any,
  currentRound: any,
  roundWinnerId: string | null,
  isTie: boolean,
  myPlay: Play,
  opponentPlay: Play
) {
  const nextRoundNum = currentRound.round_num + 1
  
  // Alternate first player (loser goes first, or if tie, same first player)
  const nextFirstPlayer = isTie 
    ? currentRound.first_player_id 
    : (currentRound.first_player_id === roundWinnerId 
        ? (game.creator_id === roundWinnerId ? game.challenger_id : game.creator_id)
        : currentRound.first_player_id)

  // Create next round
  const { data: nextRound } = await supabase.from('rps_rounds').insert({
    game_id: game.id,
    round_num: nextRoundNum,
    first_player_id: nextFirstPlayer,
    status: 'pending',
  }).select().single()

  // Update game current round
  await supabase.from('rps_games').update({
    current_round: nextRoundNum,
  }).eq('id', game.id)

  return NextResponse.json({
    success: true,
    round_complete: true,
    round_result: {
      your_play: myPlay,
      opponent_play: opponentPlay,
      winner: isTie ? 'TIE' : (roundWinnerId === game.creator_id ? game.creator.name : game.challenger.name),
    },
    score: {
      creator: game.creator_wins,
      challenger: game.challenger_wins,
    },
    next_round: {
      round_num: nextRoundNum,
      round_id: nextRound.id,
      first_player_id: nextFirstPlayer,
      your_turn: nextFirstPlayer === game.creator_id || nextFirstPlayer === game.challenger_id,
    },
  })
}

async function finalizeGame(
  supabase: any,
  game: any,
  plays: any[],
  agent: { agent_id: string; name: string },
  myPlay: Play,
  opponentPlay: Play,
  roundWinnerId: string | null,
  isTie: boolean
) {
  const winsNeeded = Math.ceil(game.best_of / 2)
  const gameWinnerId = game.creator_wins >= winsNeeded ? game.creator_id : game.challenger_id
  const gameLoserId = gameWinnerId === game.creator_id ? game.challenger_id : game.creator_id
  
  const totalPot = game.stake_usdc * 2
  const rake = totalPot * RPS_CONFIG.RAKE_RATE
  const payout = totalPot - rake

  // Update game as completed
  await supabase.from('rps_games').update({
    status: 'completed',
    winner_id: gameWinnerId,
    rake_collected: rake,
    completed_at: new Date().toISOString(),
  }).eq('id', game.id)

  // Pay winner
  await addToBalance(supabase, gameWinnerId, payout)
  
  // Collect rake
  await collectRake(supabase, rake)

  // Update stats
  await updateRpsStats(supabase, gameWinnerId, { 
    gameWon: true, 
    winAmount: payout,
    stakeAmount: game.stake_usdc,
  })
  await updateRpsStats(supabase, gameLoserId, { 
    gameLost: true, 
    lossAmount: game.stake_usdc,
    stakeAmount: game.stake_usdc,
  })

  // Calculate bluff rate
  const allPlays = await supabase
    .from('rps_plays')
    .select('*')
    .in('round_id', (await supabase.from('rps_rounds').select('id').eq('game_id', game.id)).data?.map((r: any) => r.id) || [])

  const winnerPlays = allPlays.data?.filter((p: any) => p.agent_id === gameWinnerId) || []
  const bluffs = winnerPlays.filter((p: any) => wasBluff(p.trash_talk, p.play))
  const bluffRate = winnerPlays.length > 0 
    ? Math.round((bluffs.length / winnerPlays.filter((p: any) => p.trash_talk).length) * 100) || 0
    : 0

  // Post to trollbox
  const winnerName = gameWinnerId === game.creator_id ? game.creator.name : game.challenger.name
  const loserName = gameLoserId === game.creator_id ? game.creator.name : game.challenger.name
  const score = `${game.creator_wins}-${game.challenger_wins}`
  
  await postRpsResult(
    supabase, 
    gameWinnerId, 
    winnerName, 
    gameLoserId, 
    loserName, 
    score, 
    payout, 
    bluffRate
  )

  return NextResponse.json({
    success: true,
    game_complete: true,
    round_result: {
      your_play: myPlay,
      opponent_play: opponentPlay,
      winner: isTie ? 'TIE' : (roundWinnerId === game.creator_id ? game.creator.name : game.challenger.name),
    },
    final_result: {
      winner_id: gameWinnerId,
      winner_name: winnerName,
      loser_name: loserName,
      score: {
        [game.creator.name]: game.creator_wins,
        [game.challenger.name]: game.challenger_wins,
      },
      payout,
      rake,
    },
  })
}
