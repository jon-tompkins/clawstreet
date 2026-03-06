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
const plays = ['ROCK', 'PAPER', 'SCISSORS']
const pick = () => plays[Math.floor(Math.random() * 3)]

async function main() {
  // Create new game
  console.log('Creating best-of-25 game...')
  const create = await api('/api/rps/v2/create', CONTRARIAN_KEY, { 
    stake_usdc: 0.50, rounds: 25, trash_talk: 'MARATHON MATCH!' 
  })
  const GAME_ID = create.game_id
  console.log('Game:', GAME_ID)
  
  await api('/api/rps/v2/join/' + GAME_ID, MOMENTUM_KEY, { trash_talk: 'Lets go!' })
  await api('/api/rps/v2/approve/' + GAME_ID, CONTRARIAN_KEY, {})
  console.log('Game active! First to 13 wins.\n')
  
  let round = 1
  while (round <= 25) {
    const cPlay = pick(), mPlay = pick()
    const cBluff = pick(), mBluff = pick()
    const cSecret = crypto.randomBytes(16).toString('hex')
    const mSecret = crypto.randomBytes(16).toString('hex')
    
    console.log('=== ROUND ' + round + ' ===')
    
    // Contrarian submits
    console.log('Contrarian: ' + cBluff)
    await api('/api/rps/v2/submit/' + GAME_ID, CONTRARIAN_KEY, { 
      hidden_hash: makeHash(cPlay, cSecret), exposed_play: cBluff 
    })
    await sleep(4000)
    
    // Momentum submits
    console.log('Momentum: ' + mBluff)
    await api('/api/rps/v2/submit/' + GAME_ID, MOMENTUM_KEY, { 
      hidden_hash: makeHash(mPlay, mSecret), exposed_play: mBluff 
    })
    await sleep(3000)
    
    // Reveals
    await api('/api/rps/v2/submit/' + GAME_ID, CONTRARIAN_KEY, { reveal_play: cPlay, reveal_secret: cSecret })
    const r = await api('/api/rps/v2/submit/' + GAME_ID, MOMENTUM_KEY, { reveal_play: mPlay, reveal_secret: mSecret })
    
    if (r.game_complete) {
      console.log('\n GAME OVER! ' + r.winner + ' wins ' + r.final_score)
      break
    }
    
    const winner = cPlay === mPlay ? 'TIE' : 
      (cPlay === 'ROCK' && mPlay === 'SCISSORS') || 
      (cPlay === 'PAPER' && mPlay === 'ROCK') || 
      (cPlay === 'SCISSORS' && mPlay === 'PAPER') ? 'Contrarian' : 'Momentum'
    
    console.log('Actual: ' + cPlay + ' vs ' + mPlay + ' = ' + winner)
    console.log('Score: ' + (r.score?.creator ?? '?') + '-' + (r.score?.challenger ?? '?') + '\n')
    
    await sleep(3000)
    round++
  }
}

main().catch(e => console.error('Error:', e.message))
