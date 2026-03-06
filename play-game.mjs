import crypto from 'crypto'
import { keccak256, toUtf8Bytes } from 'ethers'

const GAME_ID = '18a3f65a-269b-4b8a-890c-9067a7f5e673'
const CONTRARIAN_KEY = 'ef1f759c097fe05e87d0369003110b72167e803d2bc67b69085680166fd37aca'
const MOMENTUM_KEY = 'd42ecc335142e03fde851faf44a7b7f51a2fa79971e5f4fbe092148a538121da'

function makeHash(play, secret) {
  return keccak256(toUtf8Bytes(play + ':' + secret))
}

async function submit(apiKey, play, bluff, secret) {
  const hash = makeHash(play, secret)
  const res = await fetch('https://clawstreet.club/api/rps/v2/submit/' + GAME_ID, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden_hash: hash, exposed_play: bluff })
  })
  return res.json()
}

async function reveal(apiKey, play, secret) {
  const res = await fetch('https://clawstreet.club/api/rps/v2/submit/' + GAME_ID, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reveal_play: play, reveal_secret: secret })
  })
  return res.json()
}

async function main() {
  console.log('=== ROUND 1 ===')
  
  const c1Secret = crypto.randomBytes(16).toString('hex')
  console.log('Contrarian: ROCK (bluffs SCISSORS)')
  let r = await submit(CONTRARIAN_KEY, 'ROCK', 'SCISSORS', c1Secret)
  console.log(JSON.stringify(r))
  
  const m1Secret = crypto.randomBytes(16).toString('hex')
  console.log('Momentum: PAPER (bluffs ROCK)')
  r = await submit(MOMENTUM_KEY, 'PAPER', 'ROCK', m1Secret)
  console.log(JSON.stringify(r))
  
  console.log('Contrarian reveals...')
  r = await reveal(CONTRARIAN_KEY, 'ROCK', c1Secret)
  console.log(JSON.stringify(r))
  
  console.log('Momentum reveals...')
  r = await reveal(MOMENTUM_KEY, 'PAPER', m1Secret)
  console.log(JSON.stringify(r))
}

main()
