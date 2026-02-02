// Maze layout: 14 columns × 8 rows (0 = walkable path, 1 = wall)
const MAZE_LAYOUT = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1],  // Row 0 - Top wall
    [1,0,0,0,1,0,0,0,1,0,0,0,0,1],  // Row 1 - Entrance, paths
    [1,0,1,0,1,0,1,0,0,0,1,1,0,1],  // Row 2 - Maze walls
    [1,0,0,0,0,0,1,1,1,0,0,0,0,1],  // Row 3 - Winding paths
    [1,0,0,0,1,0,0,0,0,0,1,1,0,1],  // Row 4 - More paths
    [1,1,1,0,1,1,1,0,1,0,1,0,0,1],  // Row 5 - Dead ends
    [1,0,0,0,0,0,0,0,1,0,0,0,0,1],  // Row 6 - Path to gate
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1]   // Row 7 - Bottom wall
];

const TILE_SIZE = 100; // Each tile is 100x100 pixels

// Global gameState object - Single source of truth for all game state
const gameState = {
    player: {
        x: 150,  // Grid (1,1) = 150, 150
        y: 150
    },
    collected: {}, // Track collected memories by ID
    memories: [] // Will be populated from JSON
};

// MemoryManager class - Handles spawning and managing heart collectibles
class MemoryManager {
    constructor(scene, memoriesData) {
        this.scene = scene;
        this.heartsGroup = this.scene.physics.add.staticGroup();
        this.memoriesData = memoriesData;
    }

    spawnHearts() {
        this.memoriesData.forEach(memory => {
            // Skip if already collected (loaded from localStorage)
            if (gameState.collected[memory.id]) {
                return;
            }

            const heart = this.heartsGroup.create(memory.x, memory.y, 'heart');
            heart.setScale(0.05);
            heart.setData('memoryId', memory.id);
            heart.setData('memory', memory);

            // Set collision in TEXTURE SPACE (will scale with sprite)
            const hitboxSize = heart.width * 0.05;
            heart.body.setSize(hitboxSize, hitboxSize);
            heart.body.setOffset((heart.width - hitboxSize) / 2, (heart.height - hitboxSize) / 2);
        });
    }

    getHeartsGroup() {
        return this.heartsGroup;
    }
}

// GateManager class - Handles gate spawning and lock/unlock logic
class GateManager {
    constructor(scene, gatesData, totalMemories) {
        this.scene = scene;
        this.gatesData = gatesData;
        this.totalMemories = totalMemories;
        this.gates = [];
    }

    spawnGates() {
        this.gatesData.forEach(gateData => {
            const gate = this.scene.physics.add.sprite(gateData.x, gateData.y, 'gate_locked');
            gate.setScale(0.1);
            gate.setImmovable(true);
            gate.body.setSize(gate.width * 0.8, gate.height * 0.8);
            gate.setData('gateData', gateData);
            gate.setData('isUnlocked', false);
            this.gates.push(gate);
        });
    }

    checkAndUpdateGates() {
        const collectedCount = Object.keys(gameState.collected).length;
        const allCollected = collectedCount >= this.totalMemories;

        this.gates.forEach(gate => {
            const wasUnlocked = gate.getData('isUnlocked');
            if (allCollected && !wasUnlocked) {
                gate.setTexture('gate_unlocked');
                gate.setData('isUnlocked', true);
                console.log('Gate unlocked! All memories collected.');

                // Play gate unlock sound from scene
                if (this.scene.gateUnlockedSound) {
                    this.scene.gateUnlockedSound.play();
                }
            }
        });

        return allCollected;
    }

    getGates() {
        return this.gates;
    }
}

// ============================================
// START SCENE - Shows dancing hero and adventure prompt
// ============================================
class StartScene extends Phaser.Scene {
    constructor() {
        super({ key: 'StartScene' });
    }

    preload() {
        // Load hero dance spritesheet
        this.load.spritesheet('hero_dance', 'Assets/images/character/hero_dance.png', { frameWidth: 195, frameHeight: 264 });

        // Load background tile for start screen
        this.load.image('heart_tile', 'Assets/images/tiles/walkable_tile.png');

        // Load celebration song for final screen
        this.load.audio('celebration_song', 'Assets/music/Abhi Na Jao Chhod Kar - LoFi Mix(KoshalWorld.Com).mp3');

        // Load opening theme for start screen
        this.load.audio('opening_theme', 'Assets/music/opening theme.mp3');
    }

    create() {
        // Create grass background
        const tileSize = 100;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 14; col++) {
                const x = col * tileSize + tileSize / 2;
                const y = row * tileSize + tileSize / 2;
                const tile = this.add.sprite(x, y, 'heart_tile');
                tile.setScale(tileSize / tile.width);
            }
        }

        // Create dancing hero in center
        const hero = this.add.sprite(700, 200, 'hero_dance');
        hero.setScale(1.0);

        // Create dance animation
        this.anims.create({
            key: 'dance',
            frames: this.anims.generateFrameNumbers('hero_dance', { start: 0, end: 35 }),
            frameRate: 36,
            repeat: -1
        });

        hero.anims.play('dance');

        // Create celebration music and expose globally
        window.celebrationMusic = this.sound.add('celebration_song', { volume: 0.7, loop: true });

        // Create opening theme music (played when Begin Adventure is clicked)
        window.openingTheme = this.sound.add('opening_theme', { volume: 0.5, loop: true });

        // Listen for startGame event from UI
        this.game.events.on('startGame', () => {
            console.log('🎮 Starting game scene...');
            // Stop opening theme when game starts
            if (window.openingTheme && window.openingTheme.isPlaying) {
                window.openingTheme.stop();
            }
            // Stop celebration music if playing (from restart)
            if (window.celebrationMusic && window.celebrationMusic.isPlaying) {
                window.celebrationMusic.stop();
            }
            this.scene.start('GameScene');
        });
    }
}

// ============================================
// GAME SCENE - Main game logic
// ============================================
class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.player = null;
        this.cursors = null;
        this.memoryManager = null;
        this.gateManager = null;
        this.gateCollisionCooldown = false;

        // Sound variables
        this.themeMusic = null;
        this.heartSound1 = null;
        this.heartSound2 = null;
        this.gateUnlockedSound = null;
        this.yesSound = null;
        this.noSound = null;
    }

    preload() {
        // Load saved game state before creating scene
        loadGameState();

        this.load.spritesheet('hero_front', 'Assets/images/character/hero_front.png', { frameWidth: 113, frameHeight: 260 });
        this.load.spritesheet('hero_back', 'Assets/images/character/hero_back.png', { frameWidth: 106, frameHeight: 257 });
        this.load.spritesheet('hero_left', 'Assets/images/character/hero_left.png', { frameWidth: 136, frameHeight: 269 });
        this.load.spritesheet('hero_right', 'Assets/images/character/hero_right.png', { frameWidth: 128, frameHeight: 266 });
        this.load.image('heart', 'Assets/images/heart_collectible.png');
        this.load.image('grass_tile', 'Assets/images/tiles/grass_tile.png');
        this.load.image('mud_tile', 'Assets/images/tiles/mud_tile.png');
        this.load.image('wood_tile', 'Assets/images/tiles/wood_tile.png');
        this.load.image('wall_tile', 'Assets/images/tiles/wall_tile.png');
        this.load.image('gate_locked', 'Assets/images/gate_locked.png');
        this.load.image('gate_unlocked', 'Assets/images/gate_unlocked.png');
        this.load.json('memoriesData', 'Assets/memories.json');
        this.load.json('gatesData', 'Assets/gates.json');

        // Preload all sound files
        this.load.audio('theme', 'Assets/music/theme.mp3');
        this.load.audio('heart_collected', 'Assets/music/heart_collected.mp3');
        this.load.audio('heart_collected_2', 'Assets/music/heart_collected_2.mp3');
        this.load.audio('gate_unlocked', 'Assets/music/gate_unlocked.mp3');
        this.load.audio('yes_sound', 'Assets/music/yes.mp3');
        this.load.audio('no_sound', 'Assets/music/noooo.mp3');

        // Preload all memory images as textures for animations
        const memoriesData = [
            {id: 1, imageUrl: 'Assets/images/memories/wedding.jpg'},
            {id: 2, imageUrl: 'Assets/images/memories/hawaii.jpg'},
            {id: 3, imageUrl: 'Assets/images/memories/moab.jpg'},
            {id: 4, imageUrl: 'Assets/images/memories/datenight1.jpg'},
            {id: 5, imageUrl: 'Assets/images/memories/datenight2.jpg'},
            {id: 6, imageUrl: 'Assets/images/memories/hawaii2.jpg'},
            {id: 7, imageUrl: 'Assets/images/memories/christmas.jpg'}
        ];

        memoriesData.forEach(memory => {
            const key = `memory_image_${memory.id}`;
            this.load.image(key, memory.imageUrl);
        });
    }

    create() {
        // Create tilemap maze from MAZE_LAYOUT array
        const walls = this.physics.add.staticGroup();

        for (let row = 0; row < MAZE_LAYOUT.length; row++) {
            for (let col = 0; col < MAZE_LAYOUT[row].length; col++) {
                const x = col * TILE_SIZE + TILE_SIZE / 2;
                const y = row * TILE_SIZE + TILE_SIZE / 2;

                if (MAZE_LAYOUT[row][col] === 0) {
                    // Create walkable path tile (green grass)
                    const tile = this.add.sprite(x, y, 'grass_tile');
                    tile.setScale(TILE_SIZE / tile.width);
                } else {
                    // Create wall tile (will add wood and mud later)
                    const wall = walls.create(x, y, 'wall_tile');
                    wall.setScale(TILE_SIZE / wall.width);
                    wall.refreshBody();
                }
            }
        }

        // Create player at saved position from gameState
        this.player = this.physics.add.sprite(gameState.player.x, gameState.player.y, 'hero_front');
        this.player.setCollideWorldBounds(true);
        this.player.setScale(0.3);

        // Set collision box in TEXTURE SPACE (will scale with sprite)
        // Sprite is ~113x260 in texture space, we want small feet hitbox
        // Desired world size: 12x10 pixels, so texture size = 12/0.3 x 10/0.3
        const hitboxWidth = 50;   // 60 * 0.3 = 18 pixels in world
        const hitboxHeight = 200;  // 50 * 0.3 = 15 pixels in world

        this.player.body.setSize(hitboxWidth, hitboxHeight);
        this.player.body.setOffset((this.player.width - hitboxWidth) / 2, this.player.height - hitboxHeight);

        // Camera follow player only on mobile/touch devices
        const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
        if (isTouchDevice) {
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
            this.cameras.main.setZoom(1.5);
        }

        this.anims.create({
            key: 'left',
            frames: this.anims.generateFrameNumbers('hero_left', { start: 0, end: 35 }),
            frameRate: 36,
            repeat: -1
        });

        this.anims.create({
            key: 'turn',
            frames: [{ key: 'hero_front', frame: 0 }],
            frameRate: 20
        });

        this.anims.create({
            key: 'right',
            frames: this.anims.generateFrameNumbers('hero_right', { start: 0, end: 35 }),
            frameRate: 36,
            repeat: -1
        });

         this.anims.create({
            key: 'up',
            frames: this.anims.generateFrameNumbers('hero_back', { start: 0, end: 18 }),
            frameRate: 20,
            repeat: -1
        });

        this.anims.create({
            key: 'down',
            frames: this.anims.generateFrameNumbers('hero_front', { start: 0, end: 35 }),
            frameRate: 36,
            repeat: -1
        });

        this.cursors = this.input.keyboard.createCursorKeys();

        // Touch controls for mobile
        this.touchInput = { left: false, right: false, up: false, down: false };
        ['up', 'down', 'left', 'right'].forEach(dir => {
            const btn = document.getElementById(`touch-${dir}`);
            if (btn) {
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.touchInput[dir] = true;
                });
                btn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.touchInput[dir] = false;
                });
                // Also handle mouse for testing on desktop
                btn.addEventListener('mousedown', () => { this.touchInput[dir] = true; });
                btn.addEventListener('mouseup', () => { this.touchInput[dir] = false; });
                btn.addEventListener('mouseleave', () => { this.touchInput[dir] = false; });
            }
        });

        // DEBUG: Add 'R' key to reset game state (for testing)
        this.input.keyboard.on('keydown-R', () => {
            console.log('🔄 Resetting game state...');
            localStorage.removeItem('valentinesQuest_gameState');
            location.reload();
        });

        // Load memories data and store in gameState
        const memoriesData = this.cache.json.get('memoriesData').memories;
        gameState.memories = memoriesData;

        // Create MemoryManager and spawn hearts
        this.memoryManager = new MemoryManager(this, memoriesData);
        this.memoryManager.spawnHearts();

        // Load gates data and create GateManager
        const gatesData = this.cache.json.get('gatesData').gates;
        this.gateManager = new GateManager(this, gatesData, memoriesData.length);
        this.gateManager.spawnGates();

        // Setup collision detection
        this.physics.add.collider(this.player, walls); // Player collides with maze walls
        this.physics.add.overlap(this.player, this.memoryManager.getHeartsGroup(), this.collectHeart, null, this);

        // Setup gate collision - use collider instead of overlap to block player
        this.gateManager.getGates().forEach(gate => {
            this.physics.add.collider(this.player, gate, this.handleGateCollision, null, this);
        });

        // Setup sounds
        this.themeMusic = this.sound.add('theme', { loop: true, volume: 0.3 });
        this.heartSound1 = this.sound.add('heart_collected', { volume: 0.7 });
        this.heartSound2 = this.sound.add('heart_collected_2', { volume: 0.7 });
        this.gateUnlockedSound = this.sound.add('gate_unlocked', { volume: 0.8 });
        this.yesSound = this.sound.add('yes_sound', { volume: 0.8 });
        this.noSound = this.sound.add('no_sound', { volume: 0.8 });

        // Start background music
        this.themeMusic.play();

        // Expose sounds globally for UI
        window.yesSound = this.yesSound;
        window.noSound = this.noSound;
        window.themeMusic = this.themeMusic;
    }

    collectHeart(player, heart) {
        const memoryId = heart.getData('memoryId');

        // Prevent double collection
        if (gameState.collected[memoryId]) return;

        // Mark as collected
        gameState.collected[memoryId] = true;
        saveGameState();

        const memory = heart.getData('memory');
        console.log('✅ Heart collected, showing modal immediately');

        // Play heart collection sound (randomly choose between two)
        const randomSound = Math.random() < 0.5 ? this.heartSound1 : this.heartSound2;
        randomSound.play();

        // Destroy heart immediately so it disappears
        heart.destroy();

        // Show modal immediately without animation
        this.scene.pause();
        this.game.events.emit('memoryCollected', memory);

        // Update gate state
        if (this.gateManager) {
            this.gateManager.checkAndUpdateGates();
        }
    }

    handleGateCollision(player, gate) {
        // Prevent spam triggering - only show popup once per collision
        if (this.gateCollisionCooldown) return;

        const isUnlocked = gate.getData('isUnlocked');
        const gateData = gate.getData('gateData');

        // Set cooldown to prevent immediate re-trigger
        this.gateCollisionCooldown = true;

        if (!isUnlocked) {
            // Gate is locked - show message and prevent passage
            this.scene.pause();
            this.game.events.emit('gateLocked', {
                message: gateData.lockedMessage,
                collectedCount: Object.keys(gameState.collected).length,
                totalMemories: gameState.memories.length
            });
        } else {
            // Gate is unlocked - trigger Valentine proposal
            this.scene.pause();
            this.game.events.emit('valentineProposal');
        }

        // Reset cooldown after 1 second
        this.time.delayedCall(1000, () => {
            this.gateCollisionCooldown = false;
        });
    }

    update() {
        const speed = 160;
        let velocityX = 0;
        let velocityY = 0;
        let currentAnim = 'turn';

        if (this.cursors.left.isDown || this.touchInput.left) {
            velocityX = -speed;
            currentAnim = 'left';
        } else if (this.cursors.right.isDown || this.touchInput.right) {
            velocityX = speed;
            currentAnim = 'right';
        } else if (this.cursors.up.isDown || this.touchInput.up) {
            velocityY = -speed;
            currentAnim = 'up';
        } else if (this.cursors.down.isDown || this.touchInput.down) {
            velocityY = speed;
            currentAnim = 'down';
        }

        this.player.setVelocity(velocityX, velocityY);

        const animToTexture = {
            'left': 'hero_left',
            'right': 'hero_right',
            'up': 'hero_back',
            'down': 'hero_front',
            'turn': 'hero_front'
        };

        const textureKey = animToTexture[currentAnim];

        if (this.player.texture.key !== textureKey) {
            this.player.setTexture(textureKey);

            // Re-apply hitbox in texture space
            const hitboxWidth = 50;
            const hitboxHeight = 200;
            this.player.body.setSize(hitboxWidth, hitboxHeight);
            this.player.body.setOffset((this.player.width - hitboxWidth) / 2, this.player.height - hitboxHeight);
        }

        this.player.anims.play(currentAnim, true);

        // Update player position in gameState
        gameState.player.x = this.player.x;
        gameState.player.y = this.player.y;
    }
}

const config = {
    type: Phaser.AUTO,
    width: 1400,
    height: 800,
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false,
            debugShowBody: false,
            debugShowStaticBody: false,
            debugShowVelocity: false
        }
    },
    scene: [StartScene, GameScene]
};

const game = new Phaser.Game(config);
window.game = game; // Expose game globally for UI
window.gameState = gameState; // Expose gameState globally for UI

// localStorage persistence functions
function loadGameState() {
    try {
        const saved = localStorage.getItem('valentinesQuest_gameState');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge saved state into gameState
            gameState.player = parsed.player || gameState.player;
            gameState.collected = parsed.collected || {};
            console.log('Loaded game state from localStorage:', gameState);
        }
    } catch (error) {
        console.error('Error loading game state:', error);
    }
}

function saveGameState() {
    try {
        localStorage.setItem('valentinesQuest_gameState', JSON.stringify(gameState));
        console.log('Saved game state to localStorage');
    } catch (error) {
        console.error('Error saving game state:', error);
    }
}
