import crypto from 'crypto'
import { keccak256, toUtf8Bytes } from 'ethers'

const CONTRARIAN_KEY = 'ef1f759c097fe05e87d0369003110b72167e803d2bc67b69085680166fd37aca'
const MOMENTUM_KEY = 'd42ecc335142e03fde851faf44a7b7f51a2fa79971e5f4fbe092148a538121da'

function makeHash(play, secret) {
  return keccak256(toUtf8Bytes(play + ':' + secret))
}

async function api(path, key, body) {
  const res = await fetch('https://clawstreet.club' + path, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log('🎮 Creating game...')
  let r = await api('/api/rps/v2/create', CONTRARIAN_KEY, { 
    stake_usdc: 0.50, rounds: 3, trash_talk: 'SLOW GAME - Watch the UI! 👀' 
  })
  const gameId = r.game_id
  console.log('Game:', gameId)
  console.log('>>> REFRESH UI NOW - should see OPEN game <<<')
  await sleep(10000)
  
  console.log('\n🎮 Momentum joining...')
  await api('/api/rps/v2/join/' + gameId, MOMENTUM_KEY, { trash_talk: 'Ready!' })
  console.log('>>> Should see PENDING APPROVAL <<<')
  await sleep(8000)
  
  console.log('\n🎮 Approving...')
  await api('/api/rps/v2/approve/' + gameId, CONTRARIAN_KEY, {})
  console.log('>>> Should see ACTIVE with countdown timer <<<')
  await sleep(8000)
  
  // Round 1
  console.log('\n=== ROUND 1 ===')
  const c1Secret = crypto.randomBytes(16).toString('hex')
  const m1Secret = crypto.randomBytes(16).toString('hex')
  
  console.log('Contrarian submits SCISSORS...')
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { 
    hidden_hash: makeHash('ROCK', c1Secret), exposed_play: 'SCISSORS' 
  })
  console.log('>>> Should see SCISSORS icon for Contrarian <<<')
  await sleep(6000)
  
  console.log('Momentum submits ROCK...')
  await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { 
    hidden_hash: makeHash('PAPER', m1Secret), exposed_play: 'ROCK' 
  })
  console.log('>>> Should see both plays, status: REVEALING <<<')
  await sleep(6000)
  
  console.log('Reveals happening...')
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { reveal_play: 'ROCK', reveal_secret: c1Secret })
  r = await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { reveal_play: 'PAPER', reveal_secret: m1Secret })
  console.log('Round 1 result:', r.result || r.message)
  console.log('>>> Score should update <<<')
  await sleep(5000)
  
  console.log('\n=== FINISHING REMAINING ROUNDS QUICKLY ===')
  
  // Round 2
  const c2 = crypto.randomBytes(16).toString('hex')
  const m2 = crypto.randomBytes(16).toString('hex')
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { hidden_hash: makeHash('SCISSORS', c2), exposed_play: 'PAPER' })
  await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { hidden_hash: makeHash('PAPER', m2), exposed_play: 'ROCK' })
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { reveal_play: 'SCISSORS', reveal_secret: c2 })
  r = await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { reveal_play: 'PAPER', reveal_secret: m2 })
  console.log('Round 2:', r.result || r.message)
  
  // Round 3
  const c3 = crypto.randomBytes(16).toString('hex')
  const m3 = crypto.randomBytes(16).toString('hex')
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { hidden_hash: makeHash('ROCK', c3), exposed_play: 'ROCK' })
  await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { hidden_hash: makeHash('SCISSORS', m3), exposed_play: 'SCISSORS' })
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { reveal_play: 'ROCK', reveal_secret: c3 })
  r = await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { reveal_play: 'SCISSORS', reveal_secret: m3 })
  
  console.log('\n🏆 GAME OVER!')
  console.log('Winner:', r.winner)
  console.log('Score:', r.final_score)
}

main()
