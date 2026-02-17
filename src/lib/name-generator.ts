// Agent Name Generator - 80s/90s Finance Film Inspired

// First names from iconic characters
const FIRST_NAMES = [
  // Wall Street
  'Gordon', 'Bud', 'Carl', 'Larry',
  // Glengarry Glen Ross  
  'Blake', 'Ricky', 'Shelley', 'Dave', 'John',
  // American Psycho
  'Patrick', 'Paul', 'Craig', 'Marcus', 'Timothy',
  // Boiler Room
  'Seth', 'Jim', 'Greg', 'Chris',
  // Trading Places
  'Louis', 'Billy', 'Randolph', 'Mortimer',
  // Wolf of Wall Street
  'Jordan', 'Donnie', 'Mark', 'Nicky',
  // Margin Call
  'Sam', 'Will', 'Peter', 'Eric',
  // Barbarians at the Gate
  'Ross', 'Henry', 'Ted',
  // Other 80s/90s finance vibes
  'Maxwell', 'Sterling', 'Chase', 'Preston', 'Blaine',
]

// Last names / identifiers
const LAST_NAMES = [
  // Wall Street
  'Gekko', 'Fox', 'Wildman', 'Lynch',
  // Glengarry Glen Ross
  'Roma', 'Levene', 'Moss', 'Aaronow',
  // American Psycho
  'Bateman', 'Allen', 'Halberstram', 'Bryce',
  // Boiler Room
  'Davis', 'Young', 'Marlin',
  // Trading Places
  'Winthorpe', 'Valentine', 'Duke',
  // Wolf of Wall Street
  'Belfort', 'Azoff', 'Hanna',
  // Margin Call
  'Tuld', 'Rogers', 'Sullivan', 'Dale',
  // Generic finance surnames
  'Sterling', 'Crane', 'Pierce', 'Whitmore', 'Ashford',
]

// Prefixes for extra flair
const PREFIXES = [
  'Alpha', 'Beta', 'Delta', 'Sigma', 'Omega',
  'Prime', 'Ultra', 'Apex', 'Quantum', 'Vector',
  'Titan', 'Atlas', 'Nova', 'Nexus', 'Zero',
]

// Suffixes
const SUFFIXES = [
  'I', 'II', 'III', 'IV', 'V', 'VII', 'IX', 'X',
  '1', '2', '3', '7', '9', '99',
  'Prime', 'Alpha', 'Zero', 'Max',
]

// Iconic quotes for fun (could show on profile)
export const QUOTES = [
  "Greed, for lack of a better word, is good.", // Wall Street
  "Money never sleeps.", // Wall Street
  "Always be closing.", // Glengarry Glen Ross
  "Coffee is for closers.", // Glengarry Glen Ross
  "I have to return some videotapes.", // American Psycho
  "I'm on the pursuit of happiness.", // Boiler Room
  "Looking good, Billy Ray! Feeling good, Louis!", // Trading Places
  "Sell me this pen.", // Wolf of Wall Street
  "The key to this business is personal relationships.", // Barbarians
  "There are three ways to make a living: be first, be smarter, or cheat.", // Margin Call
  "It's not about the money. It's about the game.", 
  "In this building, it's kill or be killed.",
  "The mother of all evil is speculation.",
  "Bulls make money, bears make money, pigs get slaughtered.",
]

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export type NameStyle = 'classic' | 'codename' | 'full' | 'random'

export function generateAgentName(style: NameStyle = 'random'): string {
  if (style === 'random') {
    style = randomFrom(['classic', 'codename', 'full'] as NameStyle[])
  }

  switch (style) {
    case 'classic':
      // "Gordon Gekko" style
      return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`
    
    case 'codename':
      // "ALPHA-GEKKO-7" style
      return `${randomFrom(PREFIXES)}-${randomFrom(LAST_NAMES).toUpperCase()}-${randomFrom(SUFFIXES)}`
    
    case 'full':
      // "Patrick Bateman III" style
      return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)} ${randomFrom(SUFFIXES)}`
    
    default:
      return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`
  }
}

export function generateMultipleNames(count: number = 5): string[] {
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    names.push(generateAgentName('random'))
  }
  return names
}

export function getRandomQuote(): string {
  return randomFrom(QUOTES)
}
