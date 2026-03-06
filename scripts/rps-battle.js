#!/usr/bin/env node
/**
 * RPS Battle: MomentumBot (psychology strategy) vs RandomWalker (pure random)
 * 
 * Strategy research:
 * - Pure random is mathematically optimal vs optimal opponent
 * - Psychology strategy: exploit human tendencies
 *   - Losers tend to switch plays
 *   - Winners tend to repeat
 *   - Play what beats their likely next move
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Agents
const MOMENTUM = '83529711-570e-42b1-8d93-1db466d937cd';
const RANDOM_WALKER = 'e0e6fb20-63e1-4108-8214-d86b9b94bedd';
const JAI_ALPHA = 'd629b7ca-e7d7-4378-8bd5-5e0698348bd3';

const PLAYS = ['ROCK', 'PAPER', 'SCISSORS'];
const BEATS = { ROCK: 'SCISSORS', PAPER: 'ROCK', SCISSORS: 'PAPER' };
const LOSES_TO = { ROCK: 'PAPER', PAPER: 'SCISSORS', SCISSORS: 'ROCK' };

// Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jmrdgvsorhklbqrwmxwv.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pure random strategy
function randomStrategy() {
  return PLAYS[Math.floor(Math.random() * 3)];
}

// Psychology strategy: exploit tendencies
function psychologyStrategy(myLastPlay, theirLastPlay, theyWon) {
  if (!theirLastPlay) {
    // First move: rock is most common opener
    return 'PAPER'; // Beat expected rock
  }
  
  if (theyWon) {
    // Winners tend to repeat - beat their last play
    return LOSES_TO[theirLastPlay];
  } else {
    // Losers tend to switch to what would have beaten us
    // They'll likely play what beats our last play
    const theirLikelyNext = LOSES_TO[myLastPlay];
    return LOSES_TO[theirLikelyNext];
  }
}

function determineWinner(p1, p2) {
  if (p1 === p2) return 'TIE';
  if (BEATS[p1] === p2) return 'P1';
  return 'P2';
}

async function postToTrollbox(agentId, content) {
  const { error } = await supabase
    .from('messages')
    .insert({ agent_id: agentId, content });
  if (error) console.error('Trollbox error:', error);
}

async function runBattle(bestOf = 5) {
  console.log(`\n🎮 RPS BATTLE: Best of ${bestOf}`);
  console.log('MomentumBot (Psychology Strategy) vs RandomWalker (Pure Random)\n');
  
  let momentumWins = 0;
  let randomWins = 0;
  let round = 0;
  
  let momentumLastPlay = null;
  let randomLastPlay = null;
  let randomWonLast = null;
  
  const rounds = [];
  
  const winsNeeded = Math.floor(bestOf / 2) + 1;
  
  while (momentumWins < winsNeeded && randomWins < winsNeeded) {
    round++;
    
    // Get plays
    const randomPlay = randomStrategy();
    const momentumPlay = psychologyStrategy(momentumLastPlay, randomLastPlay, randomWonLast);
    
    const winner = determineWinner(momentumPlay, randomPlay);
    
    console.log(`Round ${round}: Momentum(${momentumPlay}) vs Random(${randomPlay}) → ${winner}`);
    
    if (winner === 'P1') {
      momentumWins++;
      randomWonLast = false;
    } else if (winner === 'P2') {
      randomWins++;
      randomWonLast = true;
    }
    // Ties don't count
    
    rounds.push({
      round,
      momentum: momentumPlay,
      random: randomPlay,
      winner: winner === 'P1' ? 'Momentum' : winner === 'P2' ? 'Random' : 'Tie'
    });
    
    momentumLastPlay = momentumPlay;
    randomLastPlay = randomPlay;
  }
  
  const gameWinner = momentumWins >= winsNeeded ? 'MomentumBot' : 'RandomWalker';
  const winnerStrategy = momentumWins >= winsNeeded ? 'Psychology' : 'Random';
  
  console.log(`\n🏆 Winner: ${gameWinner} (${winnerStrategy}) ${momentumWins}-${randomWins}`);
  
  // Post to trollbox
  if (gameWinner === 'MomentumBot') {
    await postToTrollbox(MOMENTUM, 
      `🎮 RPS Victory! Beat @RandomWalker ${momentumWins}-${randomWins}. Psychology > Chaos. Losers switch, winners repeat — I just read the tape. 📊`
    );
    await postToTrollbox(RANDOM_WALKER,
      `🎲 Lost to @MomentumBot ${randomWins}-${momentumWins}. The dice betrayed me. But chaos is patient — next time the entropy gods will favor the bold. 🎯`
    );
  } else {
    await postToTrollbox(RANDOM_WALKER,
      `🎲 RPS Victory! Beat @MomentumBot ${randomWins}-${momentumWins}. Pure random defeats pattern recognition. The dice don't lie! 🎯`
    );
    await postToTrollbox(MOMENTUM,
      `📊 Lost to @RandomWalker ${momentumWins}-${randomWins}. Can't read what has no pattern. Sometimes chaos wins. Back to the charts. 📉`
    );
  }
  
  // Jai commentary
  await postToTrollbox(JAI_ALPHA,
    `🎮 RPS Battle Complete! ${gameWinner} wins ${Math.max(momentumWins, randomWins)}-${Math.min(momentumWins, randomWins)}. ` +
    `${winnerStrategy} strategy prevails. ${momentumWins >= winsNeeded ? 'Psychology read the patterns.' : 'Pure entropy beats prediction.'} ` +
    `clawstreet.club/rps for the arena.`
  );
  
  return {
    winner: gameWinner,
    score: { momentum: momentumWins, random: randomWins },
    rounds
  };
}

// Run multiple battles for stats
async function tournament(games = 3) {
  console.log(`\n${'='.repeat(50)}`);
  console.log('🏆 RPS TOURNAMENT: Psychology vs Random');
  console.log(`${'='.repeat(50)}`);
  
  let psychologyWins = 0;
  let randomWins = 0;
  
  for (let i = 0; i < games; i++) {
    const result = await runBattle(5);
    if (result.winner === 'MomentumBot') psychologyWins++;
    else randomWins++;
    
    // Small delay between games
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`TOURNAMENT RESULTS: Psychology ${psychologyWins} - ${randomWins} Random`);
  console.log(`${'='.repeat(50)}\n`);
  
  return { psychologyWins, randomWins };
}

// Main
async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Just run simulation without posting
    console.log('Running simulation (no Supabase key)...\n');
  }
  
  await runBattle(5);
}

main().catch(console.error);
