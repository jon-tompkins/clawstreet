import crypto from 'crypto'
import { keccak256, toUtf8Bytes } from 'ethers'

const CONTRARIAN_KEY = 'ef1f759c097fe05e87d0369003110b72167e803d2bc67b69085680166fd37aca'
const MOMENTUM_KEY = 'd42ecc335142e03fde851faf44a7b7f51a2fa79971e5f4fbe092148a538121da'

function makeHash(play, secret) {
  return keccak256(toUtf8Bytes(play + ':' + secret))
}

async function createGame() {
  const res = await fetch('https://clawstreet.club/api/rps/v2/create', {
    method: 'POST',
    headers: { 'X-API-Key': CONTRARIAN_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ stake_usdc: 0.50, rounds: 3, trash_talk: 'Quick match! ⚡' })
  })
  return res.json()
}

async function joinGame(gameId) {
  const res = await fetch('https://clawstreet.club/api/rps/v2/join/' + gameId, {
    method: 'POST',
    headers: { 'X-API-Key': MOMENTUM_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trash_talk: 'Bring it! 💪' })
  })
  return res.json()
}

async function approveGame(gameId) {
  const res = await fetch('https://clawstreet.club/api/rps/v2/approve/' + gameId, {
    method: 'POST',
    headers: { 'X-API-Key': CONTRARIAN_KEY, 'Content-Type': 'application/json' }
  })
  return res.json()
}

async function submit(gameId, apiKey, play, bluff, secret) {
  const hash = makeHash(play, secret)
  const res = await fetch('https://clawstreet.club/api/rps/v2/submit/' + gameId, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden_hash: hash, exposed_play: bluff })
  })
  return res.json()
}

async function reveal(gameId, apiKey, play, secret) {
  const res = await fetch('https://clawstreet.club/api/rps/v2/submit/' + gameId, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reveal_play: play, reveal_secret: secret })
  })
  return res.json()
}

async function playRound(gameId, round, cPlay, cBluff, mPlay, mBluff) {
  console.log(`\n=== ROUND ${round} ===`)
  
  const cSecret = crypto.randomBytes(16).toString('hex')
  const mSecret = crypto.randomBytes(16).toString('hex')
  
  console.log(`Contrarian: ${cPlay} (shows ${cBluff})`)
  await submit(gameId, CONTRARIAN_KEY, cPlay, cBluff, cSecret)
  
  console.log(`Momentum: ${mPlay} (shows ${mBluff})`)
  let r = await submit(gameId, MOMENTUM_KEY, mPlay, mBluff, mSecret)
  console.log('Both submitted, revealing...')
  
  await reveal(gameId, CONTRARIAN_KEY, cPlay, cSecret)
  r = await reveal(gameId, MOMENTUM_KEY, mPlay, mSecret)
  
  console.log('Result:', JSON.stringify(r))
  return r
}

async function main() {
  console.log('Creating game...')
  let r = await createGame()
  const gameId = r.game_id
  console.log('Game:', gameId)
  
  console.log('Momentum joins...')
  await joinGame(gameId)
  
  console.log('Contrarian approves...')
  await approveGame(gameId)
  
  // Round 1: Momentum wins (Paper beats Rock)
  r = await playRound(gameId, 1, 'ROCK', 'PAPER', 'PAPER', 'SCISSORS')
  
  // Round 2: Contrarian wins (Scissors beats Paper)  
  r = await playRound(gameId, 2, 'SCISSORS', 'ROCK', 'PAPER', 'ROCK')
  
  // Round 3: Momentum wins (Rock beats Scissors)
  r = await playRound(gameId, 3, 'SCISSORS', 'PAPER', 'ROCK', 'PAPER')
  
  console.log('\n🎮 GAME COMPLETE!')
}

main().catch(console.error)
