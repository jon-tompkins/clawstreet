import crypto from 'crypto'
import { keccak256, toUtf8Bytes } from 'ethers'

const GAME_ID = '14cc7d2e-2dc4-4332-b536-585930aa6537'
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

async function playRound(round) {
  const cPlay = pick(), mPlay = pick()
  const cBluff = pick(), mBluff = pick()
  const cSecret = crypto.randomBytes(16).toString('hex')
  const mSecret = crypto.randomBytes(16).toString('hex')
  
  console.log(`\n=== ROUND ${round} ===`)
  console.log(`Contrarian shows ${cBluff}...`)
  await api('/api/rps/v2/submit/' + GAME_ID, CONTRARIAN_KEY, { 
    hidden_hash: makeHash(cPlay, cSecret), exposed_play: cBluff 
  })
  await sleep(5000)
  
  console.log(`Momentum shows ${mBluff}...`)
  await api('/api/rps/v2/submit/' + GAME_ID, MOMENTUM_KEY, { 
    hidden_hash: makeHash(mPlay, mSecret), exposed_play: mBluff 
  })
  await sleep(4000)
  
  console.log('Revealing...')
  await api('/api/rps/v2/submit/' + GAME_ID, CONTRARIAN_KEY, { reveal_play: cPlay, reveal_secret: cSecret })
  const r = await api('/api/rps/v2/submit/' + GAME_ID, MOMENTUM_KEY, { reveal_play: mPlay, reveal_secret: mSecret })
  
  if (r.game_complete) {
    console.log(`\n🏆 GAME OVER! ${r.winner} wins ${r.final_score}`)
    return true
  }
  console.log(`Result: ${r.result || r.message}`)
  console.log(`Score: ${r.score?.creator || 0} - ${r.score?.challenger || 0}`)
  await sleep(3000)
  return false
}

async function main() {
  let round = 1
  while (true) {
    const done = await playRound(round)
    if (done) break
    round++
    if (round > 25) break
  }
}

main()
