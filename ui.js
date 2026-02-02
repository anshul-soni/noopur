function setupUI(game) {
    const memoryModal = document.getElementById('memory-modal');
    const memoryCloseButton = memoryModal.querySelector('.close-button');
    const memoryImage = memoryModal.querySelector('img');
    const memoryNote = memoryModal.querySelector('p');

    const gateModal = document.getElementById('gate-modal');
    const gateCloseButton = gateModal.querySelector('.close-button');
    const gateTitle = document.getElementById('gate-modal-title');
    const gateMessage = document.getElementById('gate-modal-message');
    const gateProgress = document.getElementById('gate-modal-progress');

    const valentineModal = document.getElementById('valentine-modal');
    const valentineMessage = document.getElementById('valentine-message');
    const valentineYesButton = document.getElementById('valentine-yes');
    const valentineNoButton = document.getElementById('valentine-no');
    let valentineRetryCount = 0;

    // Array of playful "No" responses
    const noMessages = [
        'Should have thought about that before marrying me! Try again',
        'Come on now, you know the answer!',
        'I can wait here all day...',
        'Really? You\'re still testing me?',
        'The correct answer is Yes, just so you know',
        'I\'m not giving up that easily!',
        'Wrong answer! Try again',
        'Nope, that button doesn\'t work anymore',
        'You know you want to say Yes!',
        'Still waiting for that Yes...'
    ];

    game.events.on('memoryCollected', (memory) => {
        memoryImage.src = memory.imageUrl;
        memoryNote.textContent = memory.note;
        memoryModal.style.display = 'block';
    });

    memoryCloseButton.addEventListener('click', () => {
        memoryModal.style.display = 'none';
        const scene = game.scene.getScene('GameScene');
        if (scene) {
            scene.scene.resume();
            console.log('Game resumed');

            // Save player position to localStorage when modal closes
            if (window.gameState) {
                try {
                    localStorage.setItem('valentinesQuest_gameState', JSON.stringify(window.gameState));
                    console.log('Game state saved on modal close');
                } catch (error) {
                    console.error('Error saving game state:', error);
                }
            }
        } else {
            console.error('Scene not found');
        }
    });

    game.events.on('gateLocked', (data) => {
        gateTitle.textContent = 'Gate Locked';
        gateMessage.textContent = data.message;
        gateProgress.textContent = `Memories collected: ${data.collectedCount} / ${data.totalMemories}`;
        gateModal.style.display = 'block';
    });

    game.events.on('gateUnlocked', (data) => {
        gateTitle.textContent = 'Gate Unlocked!';
        gateMessage.textContent = data.message;
        gateProgress.textContent = '';
        gateModal.style.display = 'block';
    });

    gateCloseButton.addEventListener('click', () => {
        gateModal.style.display = 'none';
        const scene = game.scene.getScene('GameScene');
        if (scene) {
            scene.scene.resume();
        } else {
            console.error('Scene not found');
        }
    });

    game.events.on('valentineProposal', () => {
        valentineRetryCount = 0;
        valentineMessage.textContent = 'Will you be my Valentine?';
        valentineModal.style.display = 'block';
    });

    valentineNoButton.addEventListener('click', () => {
        valentineRetryCount++;

        // Play "No" sound
        if (window.noSound) {
            window.noSound.play();
        }

        // Show messages in sequence first, then randomly cycle through all messages
        if (valentineRetryCount <= noMessages.length) {
            valentineMessage.textContent = noMessages[valentineRetryCount - 1];
        } else {
            // After all messages shown, pick random ones
            const randomIndex = Math.floor(Math.random() * noMessages.length);
            valentineMessage.textContent = noMessages[randomIndex];
        }
    });

    valentineYesButton.addEventListener('click', () => {
        valentineMessage.textContent = 'Yay!';

        // Stop the "No" sound if it's playing
        if (window.noSound) {
            window.noSound.stop();
        }

        // Play "Yes" sound
        if (window.yesSound) {
            window.yesSound.play();
        }

        // Trigger infinite confetti celebration!
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10003 };

        function randomInRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        // Start infinite confetti loop
        window.confettiInterval = setInterval(function() {
            const particleCount = 50;

            // Create confetti bursts from different positions
            confetti(Object.assign({}, defaults, {
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
                colors: ['#ff69b4', '#ff1493', '#ffc0cb', '#ff85c1', '#ffffff']
            }));
            confetti(Object.assign({}, defaults, {
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
                colors: ['#ff69b4', '#ff1493', '#ffc0cb', '#ff85c1', '#ffffff']
            }));
        }, 250);

        // Save proposal acceptance to localStorage
        if (window.gameState) {
            window.gameState.proposalAccepted = true;
            try {
                localStorage.setItem('valentinesQuest_gameState', JSON.stringify(window.gameState));
            } catch (error) {
                console.error('Error saving proposal state:', error);
            }
        }

        // Close modal and return to start screen after 2 seconds
        setTimeout(() => {
            valentineModal.style.display = 'none';

            // Hide start screen modal (we only want the dancing character)
            const startScreen = document.getElementById('start-screen');
            if (startScreen) {
                startScreen.style.display = 'none';
            }

            // Show ending message
            const endingMessage = document.getElementById('ending-message');
            if (endingMessage) {
                endingMessage.style.display = 'block';
            }

            // Stop theme music and play celebration song
            if (window.themeMusic && window.themeMusic.isPlaying) {
                window.themeMusic.stop();
            }

            // Stop GameScene and go back to StartScene
            const gameScene = game.scene.getScene('GameScene');
            const startScene = game.scene.getScene('StartScene');

            if (gameScene) {
                gameScene.scene.stop();
            }

            if (startScene) {
                startScene.scene.restart();
            } else {
                game.scene.start('StartScene');
            }

            // Play celebration music after scene restarts
            setTimeout(() => {
                if (window.celebrationMusic && !window.celebrationMusic.isPlaying) {
                    window.celebrationMusic.play();
                }
            }, 100);
        }, 2000);
    });
}

// Start screen logic
function setupStartScreen(game) {
    const startScreen = document.getElementById('start-screen');
    const startYesButton = document.getElementById('start-yes');
    const instructionsModal = document.getElementById('instructions-modal');
    const instructionsOkButton = document.getElementById('instructions-ok');

    startYesButton.addEventListener('click', () => {
        console.log('🎮 Begin Adventure clicked!');

        // Hide start screen with fade out
        startScreen.style.transition = 'opacity 0.5s ease-out';
        startScreen.style.opacity = '0';

        setTimeout(() => {
            startScreen.style.display = 'none';

            // Show instructions modal
            instructionsModal.style.display = 'block';
        }, 500);
    });

    // Handle "Got it!" button click
    instructionsOkButton.addEventListener('click', () => {
        // Hide instructions modal
        instructionsModal.style.display = 'none';

        // Start the game
        game.events.emit('startGame');
    });
}

// Splash screen logic
function setupSplashScreen(game) {
    const splashScreen = document.getElementById('splash-screen');
    const splashButton = document.getElementById('splash-start');
    const startScreen = document.getElementById('start-screen');

    splashButton.addEventListener('click', () => {
        // Unlock audio context
        if (game.sound.context && game.sound.context.state === 'suspended') {
            game.sound.context.resume();
        }

        // Start opening theme music
        if (window.openingTheme && !window.openingTheme.isPlaying) {
            window.openingTheme.play();
        }

        // Hide splash, show start screen
        splashScreen.style.display = 'none';
        startScreen.style.display = 'block';
    });
}

// Poll for the game object to be ready
const poll_for_game = setInterval(() => {
    if (window.game && window.game.scene.getScenes(true).length > 0) {
        clearInterval(poll_for_game);
        setupUI(window.game);
        setupSplashScreen(window.game);
        setupStartScreen(window.game);
    }
}, 100);