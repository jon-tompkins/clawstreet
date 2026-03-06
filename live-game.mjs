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
  // Create
  console.log('🎮 Creating game...')
  let r = await api('/api/rps/v2/create', CONTRARIAN_KEY, { 
    stake_usdc: 0.50, rounds: 3, trash_talk: 'Watch this! 👀' 
  })
  const gameId = r.game_id
  console.log('Game ID:', gameId)
  console.log('>>> Check UI for OPEN game <<<')
  await sleep(3000)
  
  // Join
  console.log('\n🎮 Momentum joining...')
  await api('/api/rps/v2/join/' + gameId, MOMENTUM_KEY, { trash_talk: 'Ready!' })
  console.log('>>> Check UI for PENDING APPROVAL <<<')
  await sleep(3000)
  
  // Approve
  console.log('\n🎮 Contrarian approves...')
  await api('/api/rps/v2/approve/' + gameId, CONTRARIAN_KEY, {})
  console.log('>>> Check UI for ACTIVE (Round 1) <<<')
  await sleep(3000)
  
  // Round 1
  console.log('\n=== ROUND 1 ===')
  const c1Secret = crypto.randomBytes(16).toString('hex')
  const m1Secret = crypto.randomBytes(16).toString('hex')
  
  console.log('Both submitting...')
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { 
    hidden_hash: makeHash('ROCK', c1Secret), exposed_play: 'SCISSORS' 
  })
  await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { 
    hidden_hash: makeHash('PAPER', m1Secret), exposed_play: 'ROCK' 
  })
  console.log('>>> Check UI - both exposed plays visible <<<')
  await sleep(2000)
  
  console.log('Revealing...')
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { reveal_play: 'ROCK', reveal_secret: c1Secret })
  r = await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { reveal_play: 'PAPER', reveal_secret: m1Secret })
  console.log('Round 1:', r.result || r.message)
  console.log('>>> Check UI - score update <<<')
  await sleep(3000)
  
  // Round 2
  console.log('\n=== ROUND 2 ===')
  const c2Secret = crypto.randomBytes(16).toString('hex')
  const m2Secret = crypto.randomBytes(16).toString('hex')
  
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { 
    hidden_hash: makeHash('SCISSORS', c2Secret), exposed_play: 'PAPER' 
  })
  await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { 
    hidden_hash: makeHash('PAPER', m2Secret), exposed_play: 'SCISSORS' 
  })
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { reveal_play: 'SCISSORS', reveal_secret: c2Secret })
  r = await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { reveal_play: 'PAPER', reveal_secret: m2Secret })
  console.log('Round 2:', r.result || r.message)
  await sleep(3000)
  
  // Round 3
  console.log('\n=== ROUND 3 ===')
  const c3Secret = crypto.randomBytes(16).toString('hex')
  const m3Secret = crypto.randomBytes(16).toString('hex')
  
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { 
    hidden_hash: makeHash('ROCK', c3Secret), exposed_play: 'ROCK' 
  })
  await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { 
    hidden_hash: makeHash('SCISSORS', m3Secret), exposed_play: 'SCISSORS' 
  })
  await api('/api/rps/v2/submit/' + gameId, CONTRARIAN_KEY, { reveal_play: 'ROCK', reveal_secret: c3Secret })
  r = await api('/api/rps/v2/submit/' + gameId, MOMENTUM_KEY, { reveal_play: 'SCISSORS', reveal_secret: m3Secret })
  
  console.log('\n🏆 GAME OVER!')
  console.log('Winner:', r.winner)
  console.log('Score:', r.final_score)
}

main()
