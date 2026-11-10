// services/characters.js
// The characters a player can pick in the waiting room. Every player in a
// session must hold a different one. The server sends this list to clients
// (GET /api/game/state), so the frontend never keeps its own copy.
const CHARACTERS = [
    { id: 'cat',       emoji: '🐱', name: 'Cat' },
    { id: 'dog',       emoji: '🐶', name: 'Dog' },
    { id: 'fox',       emoji: '🦊', name: 'Fox' },
    { id: 'panda',     emoji: '🐼', name: 'Panda' },
    { id: 'koala',     emoji: '🐨', name: 'Koala' },
    { id: 'lion',      emoji: '🦁', name: 'Lion' },
    { id: 'tiger',     emoji: '🐯', name: 'Tiger' },
    { id: 'frog',      emoji: '🐸', name: 'Frog' },
    { id: 'monkey',    emoji: '🐵', name: 'Monkey' },
    { id: 'penguin',   emoji: '🐧', name: 'Penguin' },
    { id: 'owl',       emoji: '🦉', name: 'Owl' },
    { id: 'unicorn',   emoji: '🦄', name: 'Unicorn' },
    { id: 'octopus',   emoji: '🐙', name: 'Octopus' },
    { id: 'butterfly', emoji: '🦋', name: 'Butterfly' },
    { id: 'turtle',    emoji: '🐢', name: 'Turtle' },
    { id: 'dolphin',   emoji: '🐬', name: 'Dolphin' },
    { id: 'shark',     emoji: '🦈', name: 'Shark' },
    { id: 'whale',     emoji: '🐳', name: 'Whale' },
    { id: 'dino',      emoji: '🦖', name: 'Dino' },
    { id: 'dragon',    emoji: '🐲', name: 'Dragon' },
    { id: 'robot',     emoji: '🤖', name: 'Robot' },
    { id: 'alien',     emoji: '👾', name: 'Alien' },
    { id: 'ghost',     emoji: '👻', name: 'Ghost' },
    { id: 'bear',      emoji: '🐻', name: 'Bear' },
    { id: 'rabbit',    emoji: '🐰', name: 'Rabbit' }
];

const BY_ID = new Map(CHARACTERS.map(c => [c.id, c]));

function getCharacter(id) {
    return BY_ID.get(id) || null;
}

// Default for a new player: the first character nobody in the session has.
function getNextCharacterId(players) {
    const taken = new Set(players.map(p => p.characterId));
    const free = CHARACTERS.find(c => !taken.has(c.id));
    return free ? free.id : null;
}

module.exports = { CHARACTERS, getCharacter, getNextCharacterId };
