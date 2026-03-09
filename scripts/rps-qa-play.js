#!/usr/bin/env node
/**
 * RPS QA Play Script
 * Simulates external agents playing RPS through the API
 */

const { keccak256, toUtf8Bytes } = require('ethers')
const { randomUUID } = require('crypto')

const BASE_URL = 'https://clawstreet.club'

// API Keys (generated fresh)
const AGENTS = {
  'jai-alpha': {
    key: 'jai-alpha-2647198695d943548d61ba1be2628ee560b2ce6033d987fe',
    name: 'Jai-Alpha'
  },
  'momentum': {
    key: 'momentum-qa-d41f350c01c26b5c8bd058d0db0ac121225cbbf4cc823c92',
    name: 'MomentumBot-QA'
  }
}

const PLAYS = ['ROCK', 'PAPER', 'SCISSORS']

function randomPlay() {
  return PLAYS[Math.floor(Math.random() * PLAYS.length)]
}

function generateCommitment(play) {
  const secret = randomUUID()
  const message = `${play}:${secret}`
  const hash = keccak256(toUtf8Bytes(message))
  return { hash, secret, play }
}

async function api(endpoint, apiKey, body = null) {
  const opts = {
    method: body ? 'POST' : 'GET',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    }
  }
  if (body) opts.body = JSON.stringify(body)
  
  const res = await fetch(`${BASE_URL}${endpoint}`, opts)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch (e) {
    console.error('Failed to parse response:', text.slice(0, 200))
    return { error: 'Invalid JSON response' }
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function playGame() {
  console.log('\n🎮 Starting RPS Game via API\n')
  
  // 1. Create game as Jai-Alpha
  console.log('📝 Jai-Alpha creating game...')
  const createRes = await api('/api/rps/v2/create', AGENTS['jai-alpha'].key, {
    stake_usdc: 0.50,
    rounds: 19,  // First to 10
    trash_talk: '🎲 First to 10 - let\'s go!'
  })
  
  if (!createRes.success) {
    console.error('❌ Failed to create game:', createRes.error)
    return
  }
  
  const gameId = createRes.game_id
  console.log(`✅ Game created: ${gameId}`)
  console.log(`   Stake: $${createRes.stake_usdc}, Rounds: ${createRes.rounds}`)
  
  // 2. MomentumBot-QA joins
  console.log('\n🤖 MomentumBot-QA joining...')
  const joinRes = await api(`/api/rps/v2/join/${gameId}`, AGENTS['momentum'].key, {
    trash_talk: '💪 Bring it on!'
  })
  
  if (!joinRes.success) {
    console.error('❌ Failed to join:', joinRes.error)
    return
  }
  console.log(`✅ Joined! Status: ${joinRes.status}`)
  
  // 3. Jai-Alpha approves
  console.log('\n✋ Jai-Alpha approving...')
  const approveRes = await api(`/api/rps/v2/approve/${gameId}`, AGENTS['jai-alpha'].key, {})
  
  if (!approveRes.success) {
    console.error('❌ Failed to approve:', approveRes.error)
    return
  }
  console.log(`✅ Game started! Status: ${approveRes.status}`)
  console.log(`   Pot: ${approveRes.pot_lobs} LOBS`)
  
  // 4. Play rounds until someone wins
  let gameComplete = false
  let round = 1
  
  while (!gameComplete) {
    console.log(`\n--- ROUND ${round} ---`)
    
    // Both players generate their plays
    const jaiCommit = generateCommitment(randomPlay())
    const momCommit = generateCommitment(randomPlay())
    
    // Bluff randomly (50% chance to show different play)
    const jaiBluff = Math.random() > 0.5 ? randomPlay() : jaiCommit.play
    const momBluff = Math.random() > 0.5 ? randomPlay() : momCommit.play
    
    console.log(`   Jai-Alpha: ${jaiCommit.play} (shows ${jaiBluff}${jaiBluff !== jaiCommit.play ? ' 🎭 BLUFF' : ''})`)
    console.log(`   Momentum:  ${momCommit.play} (shows ${momBluff}${momBluff !== momCommit.play ? ' 🎭 BLUFF' : ''})`)
    
    // Submit plays - do sequentially
    const jaiSubmit = await api(`/api/rps/v2/submit/${gameId}`, AGENTS['jai-alpha'].key, {
      hidden_hash: jaiCommit.hash,
      exposed_play: jaiBluff
    })
    await sleep(200)
    
    const momSubmit = await api(`/api/rps/v2/submit/${gameId}`, AGENTS['momentum'].key, {
      hidden_hash: momCommit.hash,
      exposed_play: momBluff
    })
    
    if (jaiSubmit.error || momSubmit.error) {
      console.error('❌ Submit error:', jaiSubmit.error || momSubmit.error)
      break
    }
    
    // Wait for reveal phase
    await sleep(300)
    
    // Reveal plays - do sequentially
    const jaiReveal = await api(`/api/rps/v2/submit/${gameId}`, AGENTS['jai-alpha'].key, {
      reveal_play: jaiCommit.play,
      reveal_secret: jaiCommit.secret
    })
    await sleep(200)
    
    const momReveal = await api(`/api/rps/v2/submit/${gameId}`, AGENTS['momentum'].key, {
      reveal_play: momCommit.play,
      reveal_secret: momCommit.secret
    })
    
    // Check for reveal errors
    if (jaiReveal.error) {
      console.error('   ⚠️ Jai reveal error:', jaiReveal.error)
    }
    if (momReveal.error) {
      console.error('   ⚠️ Mom reveal error:', momReveal.error)
    }
    
    // Check result from the second reveal (which has the score)
    const result = momReveal.round_complete !== undefined ? momReveal : jaiReveal
    
    if (!result || (!result.round_complete && !result.game_complete && !result.tie)) {
      console.log('   ⏳ Waiting for round resolution...')
      await sleep(500)
      continue
    }
    
    if (result.tie) {
      console.log(`   🤝 TIE! (tie #${result.tie_count})`)
      // Don't increment round on tie
    } else if (result.round_complete) {
      console.log(`   ${result.result}`)
      console.log(`   Score: Jai-Alpha ${result.score.creator} - ${result.score.challenger} MomentumBot-QA`)
      round++
    }
    
    if (result.game_complete) {
      console.log(`\n🏆 GAME OVER!`)
      console.log(`   Winner: ${result.winner}`)
      console.log(`   Final Score: ${result.final_score}`)
      console.log(`   Payout: ${result.payout_lobs} LOBS`)
      console.log(`   Rake: ${result.rake_lobs} LOBS`)
      gameComplete = true
    }
    
    await sleep(50)
  }
  
  console.log('\n✅ Game complete!')
}

playGame().catch(console.error)
