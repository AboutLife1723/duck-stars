'use strict';

/* Инициализация Telegram WebApp */
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');
}

/* Глобальное состояние игры */
const STATE = {
    balance: parseInt(localStorage.getItem('ds_balance') || '25'),
    selectedBets: { arena: 10, crash: 10, roulette: 10, coin: 10 },
    gamesPlayed: parseInt(localStorage.getItem('ds_games') || '0'),
    isNewPlayer: localStorage.getItem('ds_new') !== 'false',
    newPlayerGames: parseInt(localStorage.getItem('ds_npg') || '3'),
    activeTab: 'tasks',

    crash: {
        isRunning: false,
        multiplier: 1.00,
        betPlaced: false,
        crashPoint: 1.00,
        animFrame: null,
        startTime: null,
        hasCashedOut: false,
    },

    slots: { isSpinning: false },
    roulette: { isSpinning: false, selectedColor: null },
    coin: { isFlipping: false, selectedSide: 'heads' },
};

/* Символы и выплаты слотов */
const SLOT_SYMBOLS = [
    { emoji: '🦆', name: 'duck', weight: 3 },
    { emoji: '⭐', name: 'star', weight: 4 },
    { emoji: '💎', name: 'diamond', weight: 2 },
    { emoji: '🍀', name: 'clover', weight: 5 },
    { emoji: '🔥', name: 'fire', weight: 4 },
    { emoji: '🌟', name: 'gstar', weight: 3 },
];

const SLOT_PAYOUTS = {
    duck: { x3: 5.0, x2: 1.5 },
    diamond: { x3: 4.0, x2: 1.3 },
    star: { x3: 3.0, x2: 1.2 },
    gstar: { x3: 3.5, x2: 1.2 },
    fire: { x3: 2.5, x2: 1.1 },
    clover: { x3: 2.0, x2: 1.1 },
};

/* Утилиты */
function saveState() {
    localStorage.setItem('ds_balance', STATE.balance.toString());
    localStorage.setItem('ds_games', STATE.gamesPlayed.toString());
    localStorage.setItem('ds_new', STATE.isNewPlayer.toString());
    localStorage.setItem('ds_npg', STATE.newPlayerGames.toString());
}

function getRTP() {
    return (STATE.isNewPlayer && STATE.newPlayerGames > 0) ? 0.55 : 0.40;
}

function rollWin() {
    return Math.random() < getRTP();
}

function decrementNewPlayerGames() {
    if (STATE.isNewPlayer && STATE.newPlayerGames > 0) {
        STATE.newPlayerGames--;
        if (STATE.newPlayerGames <= 0) {
            STATE.isNewPlayer = false;
        }
        saveState();
    }
}

function updateBalanceDisplay(newBalance, animate = true) {
    const display = document.getElementById('balanceDisplay');
    if (!display) return;

    const oldBalance = STATE.balance;
    STATE.balance = Math.max(0, newBalance);
    saveState();

    if (animate && oldBalance !== STATE.balance) {
        const diff = STATE.balance - oldBalance;
        const steps = 20;
        const stepSize = diff / steps;
        let current = oldBalance;
        let step = 0;

        const tick = () => {
            step++;
            current += stepSize;
            display.textContent = Math.round(current);
            if (step < steps) requestAnimationFrame(tick);
            else display.textContent = STATE.balance;
        };
        requestAnimationFrame(tick);
    } else {
        display.textContent = STATE.balance;
    }
}

function showToast(message, type = 'info', duration = 2500) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function spawnConfetti() {
    const colors = ['#ffd700', '#ffaa00', '#ff6b6b', '#4ecdc4', '#a8e6cf'];
    for (let i = 0; i < 30; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'confetti-particle';
            particle.style.cssText = `
                left: ${Math.random() * 100}vw;
                top: -10px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
                animation-duration: ${1.5 + Math.random() * 1.5}s;
                animation-delay: ${Math.random() * 0.5}s;
                width: ${6 + Math.random() * 8}px;
                height: ${6 + Math.random() * 8}px;
            `;
            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 3000);
        }, i * 30);
    }
}

function vibrate(type = 'light') {
    tg?.HapticFeedback?.impactOccurred?.(type);
}

/* SPA Навигация */
function switchTab(tabName) {
    if (STATE.activeTab === tabName) return;

    if (STATE.activeTab === 'crash' && STATE.crash.isRunning) {
        stopCrash(true);
    }

    document.querySelectorAll('.tab-section').forEach(s => {
        s.classList.add('hidden');
    });

    document.querySelectorAll('.tab-item').forEach(b => {
        b.classList.remove('active');
    });

    const section = document.getElementById(`section-${tabName}`);
    const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);

    if (section) {
        section.classList.remove('hidden');
        section.style.animation = 'none';
        section.offsetHeight;
        section.style.animation = '';
    }

    if (tabBtn) tabBtn.classList.add('active');

    STATE.activeTab = tabName;
    vibrate('light');
}

document.getElementById('tabBar').addEventListener('click', (e) => {
    const tabItem = e.target.closest('.tab-item');
    if (tabItem) switchTab(tabItem.dataset.tab);
});

/* Система ставок */
function initBetGrid(gridId, gameKey) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.bet-btn');
        if (!btn) return;

        const amount = parseInt(btn.dataset.amount);

        if (amount > STATE.balance) {
            showToast('Недостаточно звёзд! ⭐', 'lose');
            vibrate('error');
            return;
        }

        grid.querySelectorAll('.bet-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        STATE.selectedBets[gameKey] = amount;
        vibrate('light');
    });
}

initBetGrid('slotBetGrid', 'arena');
initBetGrid('crashBetGrid', 'crash');
initBetGrid('rouletteBetGrid', 'roulette');
initBetGrid('coinBetGrid', 'coin');

/* Слоты */
function getWeightedSymbol() {
    const totalWeight = SLOT_SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
    let random = Math.random() * totalWeight;

    for (const sym of SLOT_SYMBOLS) {
        random -= sym.weight;
        if (random <= 0) return sym;
    }
    return SLOT_SYMBOLS[0];
}

function fillReel(reelId, count = 20) {
    const reel = document.getElementById(reelId);
    if (!reel) return;
    reel.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const sym = getWeightedSymbol();
        const div = document.createElement('div');
        div.className = 'reel-symbol';
        div.dataset.name = sym.name;
        div.textContent = sym.emoji;
        reel.appendChild(div);
    }
}

function animateReel(reelId, duration, finalSymbol) {
    return new Promise((resolve) => {
        const reel = document.getElementById(reelId);
        const container = reel?.parentElement;
        if (!reel || !container) { resolve(); return; }

        fillReel(reelId, 30);

        const symbolHeight = 100;
        const totalSymbols = reel.children.length;
        const targetIndex = totalSymbols - 3;
        const targetSymbol = reel.children[targetIndex];
        if (targetSymbol) targetSymbol.textContent = finalSymbol;

        reel.style.transition = 'none';
        reel.style.transform = 'translateY(0)';

        const targetY = -(targetIndex * symbolHeight - symbolHeight);

        requestAnimationFrame(() => {
            reel.style.transition = `transform ${duration}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`;
            reel.style.transform = `translateY(${targetY}px)`;
        });

        setTimeout(resolve, duration);
    });
}

function calculateSlotResult(forceWin) {
    if (forceWin) {
        const winSym = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
        return {
            symbols: [winSym.emoji, winSym.emoji, winSym.emoji],
            payout: SLOT_PAYOUTS[winSym.name]?.x3 || 3.0,
            isWin: true,
        };
    }

    let symbols;
    let attempts = 0;
    do {
        symbols = [getWeightedSymbol(), getWeightedSymbol(), getWeightedSymbol()];
        attempts++;
        if (attempts > 50) break;
    } while (symbols[0].name === symbols[1].name && symbols[1].name === symbols[2].name);

    const names = symbols.map(s => s.name);
    let payout = 0;
    let isWin = false;

    if (names[0] === names[1] || names[1] === names[2] || names[0] === names[2]) {
        const matchName = names[0] === names[1] ? names[0]
                        : names[1] === names[2] ? names[1]
                        : names[0];
        payout = SLOT_PAYOUTS[matchName]?.x2 || 1.1;
        isWin = true;
    }

    return {
        symbols: symbols.map(s => s.emoji),
        payout,
        isWin,
    };
}

async function spinSlots() {
    if (STATE.slots.isSpinning) return;

    const bet = STATE.selectedBets.arena;

    if (bet > STATE.balance) {
        showToast('Недостаточно звёзд! ⭐', 'lose');
        vibrate('error');
        return;
    }

    STATE.slots.isSpinning = true;

    const spinBtn = document.getElementById('spinBtn');
    const resultDuck = document.getElementById('resultDuck');
    const resultText = document.getElementById('resultText');

    spinBtn.disabled = true;
    spinBtn.textContent = '⏳ Крутится...';

    updateBalanceDisplay(STATE.balance - bet, true);
    vibrate('medium');

    resultDuck.src = 'assets/spin_duck.gif';
    resultText.className = 'result-text';
    // ... твой код, который уже есть на скриншоте:
    resultDuck.src = 'assets/spin_duck.gif';
    resultText.className = 'result-text';

    // ВСТАВЛЯЙ СЮДА:
    setTimeout(() => {
        // 1. Останавливаем флаг кручения, чтобы можно было нажать снова
        STATE.slots.isSpinning = false;
        
        // 2. Возвращаем кнопку в рабочее состояние
        spinBtn.disabled = false;
        spinBtn.textContent = '🎰 Крутить';

        // 3. Убираем "крутящуюся" гифку и ставим обычную утку
        // Убедись, что файл duck.png лежит в папке assets 

        // 4. Выводим текст результата (можешь заменить на свою логику выигрыша)
        resultText.textContent = 'Игра окончена!';
        
        // 5. Отправляем данные в Telegram, чтобы бот узнал о завершении
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.sendData(JSON.stringify({
                game: 'slots',
                status: 'finished'
            }));
        }
    }, 3000); // 3000 — это 3 секунды, через которые всё "отвиснет"
    resultText.textContent = '🎰 Крутим барабаны...';

    const isWin = rollWin();
    const result = calculateSlotResult(isWin);
    decrementNewPlayerGames();

    await Promise.all([
        animateReel('reelInner1', 1200, result.symbols[0]),
        animateReel('reelInner2', 1600, result.symbols[1]),
        animateReel('reelInner3', 2000, result.symbols[2]),
    ]);

    STATE.gamesPlayed++;

    if (result.isWin) {
        const winAmount = Math.floor(bet * result.payout);
        updateBalanceDisplay(STATE.balance + winAmount, true);

        resultDuck.src = 'assets/win_duck.gif';
        resultText.className = 'result-text win';
        resultText.textContent = `🎉 +${winAmount} ⭐ (x${result.payout})`;

        showToast(`🏆 Победа! +${winAmount} звёзд!`, 'win');
        spawnConfetti();
        vibrate('success');
    } else {
        resultDuck.src = 'assets/lose_duck.gif';
        resultText.className = 'result-text lose';
        resultText.textContent = `😢 Не повезло! -${bet} ⭐`;

        showToast(`😢 Проигрыш. -${bet} звёзд`, 'lose');
        vibrate('error');
    }

    saveState();
    STATE.slots.isSpinning = false;
    spinBtn.disabled = false;
    spinBtn.textContent = '🎰 Крутить!';
}

document.getElementById('spinBtn')?.addEventListener('click', spinSlots);

['reelInner1', 'reelInner2', 'reelInner3'].forEach(id => fillReel(id, 5));

/* Краш */
function generateCrashPoint() {
    const houseEdge = 0.03;
    const r = Math.random();
    if (r < houseEdge) return 1.00;

    const crash = Math.floor((0.99 / (1 - r)) * 100) / 100;
    return Math.min(crash, 100.00);
}

function drawCrashGraph(progress, crashed = false) {
    const canvas = document.getElementById('crashCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(10, 10, 15, 0.5)';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255, 215, 0, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    if (progress <= 0) return;

    const points = [];
    for (let i = 0; i <= progress * W; i += 2) {
        const t = i / W;
        const y = H - (Math.pow(t, 1.5) * H * 0.9);
        points.push({ x: i, y: Math.max(10, y) });
    }

    if (points.length < 2) return;

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    if (crashed) {
        grad.addColorStop(0, 'rgba(255, 59, 48, 0.3)');
        grad.addColorStop(1, 'rgba(255, 59, 48, 0.0)');
    } else {
        grad.addColorStop(0, 'rgba(255, 215, 0, 0.2)');
        grad.addColorStop(1, 'rgba(255, 215, 0, 0.0)');
    }

    ctx.beginPath();
    ctx.moveTo(0, H);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = crashed ? '#ff3b30' : '#ffd700';
    ctx.lineWidth = 3;
    ctx.shadowColor = crashed ? '#ff3b30' : '#ffd700';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (!crashed && points.length > 0) {
        const lastPoint = points[points.length - 1];
        const duck = document.getElementById('crashDuck');
        if (duck) {
            duck.style.left = `${lastPoint.x - 28}px`;
            duck.style.bottom = `${H - lastPoint.y - 28}px`;
        }
    }
}

function startCrash() {
    if (STATE.crash.isRunning) return;

    const bet = STATE.selectedBets.crash;

    if (bet > STATE.balance) {
        showToast('Недостаточно звёзд! ⭐', 'lose');
        vibrate('error');
        return;
    }

    STATE.crash.isRunning = true;
    STATE.crash.multiplier = 1.00;
    STATE.crash.betPlaced = true;
    STATE.crash.crashPoint = generateCrashPoint();
    STATE.crash.startTime = performance.now();
    STATE.crash.hasCashedOut = false;

    updateBalanceDisplay(STATE.balance - bet, true);

    document.getElementById('crashStart').classList.add('hidden');
    document.getElementById('crashCashout').classList.remove('hidden');
    document.getElementById('crashMultiplier').style.color = '';

    vibrate('medium');

    function gameLoop(timestamp) {
        if (!STATE.crash.isRunning) return;

        const elapsed = (timestamp - STATE.crash.startTime) / 1000;
        const multiplier = Math.pow(Math.E, 0.06 * elapsed);
        STATE.crash.multiplier = Math.round(multiplier * 100) / 100;

        const progress = Math.min(elapsed / 15, 1);

        document.getElementById('crashMultiplier').textContent =
            STATE.crash.multiplier.toFixed(2);

        drawCrashGraph(progress, false);

        if (STATE.crash.multiplier >= STATE.crash.crashPoint) {
            crashGame();
            return;
        }

        STATE.crash.animFrame = requestAnimationFrame(gameLoop);
    }

    STATE.crash.animFrame = requestAnimationFrame(gameLoop);
}

function cashoutCrash() {
    if (!STATE.crash.isRunning || STATE.crash.hasCashedOut) return;

    STATE.crash.hasCashedOut = true;
    STATE.crash.isRunning = false;

    if (STATE.crash.animFrame) {
        cancelAnimationFrame(STATE.crash.animFrame);
    }

    const bet = STATE.selectedBets.crash;
    const mult = STATE.crash.multiplier;
    const winAmount = Math.floor(bet * mult);

    updateBalanceDisplay(STATE.balance + winAmount, true);

    document.getElementById('crashMultiplier').textContent = `${mult.toFixed(2)}`;

    showToast(`💰 Забрал x${mult.toFixed(2)}! +${winAmount} ⭐`, 'win');
    spawnConfetti();
    vibrate('success');

    resetCrashUI();
    decrementNewPlayerGames();
    STATE.gamesPlayed++;
    saveState();
}

function crashGame() {
    STATE.crash.isRunning = false;

    if (STATE.crash.animFrame) {
        cancelAnimationFrame(STATE.crash.animFrame);
    }

    if (!STATE.crash.hasCashedOut) {
        const mult = document.getElementById('crashMultiplier');
        mult.textContent = `💥 ${STATE.crash.crashPoint.toFixed(2)}`;
        mult.style.color = '#ff3b30';

        drawCrashGraph(1, true);

        const bet = STATE.selectedBets.crash;
        showToast(`💥 Краш на x${STATE.crash.crashPoint.toFixed(2)}! -${bet} ⭐`, 'lose');
        vibrate('error');

        decrementNewPlayerGames();
        STATE.gamesPlayed++;
        saveState();
    }

    setTimeout(resetCrashUI, 2000);
}

function stopCrash(silent = false) {
    if (STATE.crash.animFrame) {
        cancelAnimationFrame(STATE.crash.animFrame);
    }
    STATE.crash.isRunning = false;
    if (!silent) resetCrashUI();
}

function resetCrashUI() {
    STATE.crash.isRunning = false;
    STATE.crash.betPlaced = false;
    STATE.crash.hasCashedOut = false;

    document.getElementById('crashStart').classList.remove('hidden');
    document.getElementById('crashCashout').classList.add('hidden');
    document.getElementById('crashMultiplier').textContent = '1.00';
    document.getElementById('crashMultiplier').style.color = '';

    drawCrashGraph(0);
}

document.getElementById('crashStart')?.addEventListener('click', startCrash);
document.getElementById('crashCashout')?.addEventListener('click', cashoutCrash);

/* Рулетка */
const ROULETTE_PATTERN = [
    'red','black','red','black','red','gold',
    'black','red','black','red','black','red',
    'gold','black','red','black','red','black',
];

const ROULETTE_EMOJIS = { red: '🔴', black: '⚫', gold: '🟡' };

function initRouletteTrack() {
    const track = document.getElementById('rouletteTrack');
    if (!track) return;

    const fullPattern = [...ROULETTE_PATTERN, ...ROULETTE_PATTERN,
                       ...ROULETTE_PATTERN, ...ROULETTE_PATTERN,
                       ...ROULETTE_PATTERN];

    track.innerHTML = '';
    fullPattern.forEach(color => {
        const seg = document.createElement('div');
        seg.className = `roulette-segment ${color}`;
        seg.textContent = ROULETTE_EMOJIS[color];
        track.appendChild(seg);
    });
}

function spinRoulette() {
    if (STATE.roulette.isSpinning) return;

    if (!STATE.roulette.selectedColor) {
        showToast('Выбери цвет для ставки!', 'info');
        vibrate('warning');
        return;
    }

    const bet = STATE.selectedBets.roulette;

    if (bet > STATE.balance) {
        showToast('Недостаточно звёзд! ⭐', 'lose');
        vibrate('error');
        return;
    }

    STATE.roulette.isSpinning = true;

    const spinBtn = document.getElementById('rouletteSpinBtn');
    spinBtn.disabled = true;
    spinBtn.textContent = '⏳ Крутится...';

    updateBalanceDisplay(STATE.balance - bet, true);
    vibrate('medium');

    const isWin = rollWin();
    const betColor = STATE.roulette.selectedColor;
    const betMult = parseFloat(
        document.querySelector(`.roulette-bet-btn[data-color="${betColor}"]`)
            ?.dataset.mult || '2'
    );

    let resultColor;
    if (isWin) {
        resultColor = betColor;
    } else {
        const otherColors = ROULETTE_PATTERN.filter(c => c !== betColor);
        resultColor = otherColors[Math.floor(Math.random() * otherColors.length)];
    }

    const track = document.getElementById('rouletteTrack');
    const segments = Array.from(track.children);
    const segWidth = 58;

    const searchStart = Math.floor(segments.length * 0.6);
    let targetIndex = searchStart;

    for (let i = searchStart; i < segments.length - 5; i++) {
        if (segments[i].classList.contains(resultColor)) {
            targetIndex = i;
            break;
        }
    }

    const containerWidth = track.parentElement.offsetWidth;
    const offset = -(targetIndex * segWidth) + containerWidth / 2 - segWidth / 2;

    track.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    track.style.transform = `translateX(${offset}px)`;

    setTimeout(() => {
        segments.forEach(s => s.style.transform = '');
        if (segments[targetIndex]) {
            segments[targetIndex].style.transform = 'scale(1.2)';
            segments[targetIndex].style.boxShadow = '0 0 20px rgba(255,215,0,0.8)';
        }

        STATE.gamesPlayed++;
        decrementNewPlayerGames();

        if (isWin) {
            const winAmount = Math.floor(bet * betMult);
            updateBalanceDisplay(STATE.balance + winAmount, true);
            showToast(`🎡 Победа! +${winAmount} ⭐`, 'win');
            spawnConfetti();
            vibrate('success');
        } else {
            showToast(`😢 Проигрыш. -${bet} ⭐`, 'lose');
            vibrate('error');
        }

        saveState();

        setTimeout(() => {
            track.style.transition = 'none';
            track.style.transform = 'translateX(0)';
            segments.forEach(s => {
                s.style.transform = '';
                s.style.boxShadow = '';
            });

            STATE.roulette.isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.textContent = '🎡 Запустить!';
        }, 2000);

    }, 4000);
}

document.querySelectorAll('.roulette-bet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (STATE.roulette.isSpinning) return;

        document.querySelectorAll('.roulette-bet-btn')
            .forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        STATE.roulette.selectedColor = btn.dataset.color;
        vibrate('light');
    });
});

document.getElementById('rouletteSpinBtn')?.addEventListener('click', spinRoulette);
initRouletteTrack();

/* Монетка */
function animateCoin(landOnHeads) {
    return new Promise((resolve) => {
        const coin = document.getElementById('gameCoin');
        if (!coin) { resolve(); return; }

        let rotations = 0;
        const totalFlips = 8 + Math.floor(Math.random() * 6);
        const flipDuration = 120;

        const flip = () => {
            rotations++;
            const deg = rotations * 180;
            coin.style.transform = `rotateY(${deg}deg)`;

            if (rotations < totalFlips * 2) {
                setTimeout(flip, flipDuration);
            } else {
                const finalDeg = landOnHeads ? 0 : 180;
                coin.style.transition = 'transform 0.3s ease-out';
                coin.style.transform = `rotateY(${finalDeg}deg)`;

                setTimeout(() => {
                    coin.style.transition = '';
                    resolve();
                }, 350);
            }
        };

        coin.style.transition = `transform ${flipDuration}ms linear`;
        flip();
    });
}

async function flipCoin() {
    if (STATE.coin.isFlipping) return;

    const bet = STATE.selectedBets.coin;

    if (bet > STATE.balance) {
        showToast('Недостаточно звёзд! ⭐', 'lose');
        vibrate('error');
        return;
    }

    STATE.coin.isFlipping = true;

    const flipBtn = document.getElementById('coinFlipBtn');
    const duckImg = document.getElementById('coinDuck');
    const resultTxt = document.getElementById('coinResultText');

    flipBtn.disabled = true;
    flipBtn.textContent = '🪙 Летит...';

    updateBalanceDisplay(STATE.balance - bet, true);
    vibrate('medium');

    duckImg.src = 'assets/spin_duck.gif';
    resultTxt.textContent = '🪙 Монетка в воздухе...';

    const isWin = rollWin();
    const playerSide = STATE.coin.selectedSide;
    const landOnHeads = isWin
        ? (playerSide === 'heads')
        : (playerSide !== 'heads');

    decrementNewPlayerGames();

    await animateCoin(landOnHeads);

    STATE.gamesPlayed++;

    if (isWin) {
        const winAmount = Math.floor(bet * 1.9);
        updateBalanceDisplay(STATE.balance + winAmount, true);

        duckImg.src = 'assets/win_duck.gif';
        resultTxt.textContent = `🎉 Угадал! +${winAmount} ⭐`;
        resultTxt.style.color = 'var(--color-accent-green)';

        showToast(`🪙 Победа! +${winAmount} звёзд!`, 'win');
        spawnConfetti();
        vibrate('success');
    } else {
        duckImg.src = 'assets/lose_duck.gif';
        resultTxt.textContent = `😢 Не угадал! -${bet} ⭐`;
        resultTxt.style.color = 'var(--color-accent-red)';

        showToast(`😢 Промах! -${bet} звёзд`, 'lose');
        vibrate('error');
    }

    saveState();

    setTimeout(() => {
        resultTxt.style.color = '';
        STATE.coin.isFlipping = false;
        flipBtn.disabled = false;
        flipBtn.textContent = '🪙 Подбросить!';
    }, 1500);
}

document.querySelectorAll('.coin-choice').forEach(btn => {
    btn.addEventListener('click', () => {
        if (STATE.coin.isFlipping) return;

        document.querySelectorAll('.coin-choice')
            .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        STATE.coin.selectedSide = btn.dataset.side;
        vibrate('light');
    });
});

document.getElementById('coinFlipBtn')?.addEventListener('click', flipCoin);

/* Задания */
document.getElementById('task-first-game')?.addEventListener('click', function () {
    if (this.dataset.claimed) return;

    this.dataset.claimed = 'true';
    this.textContent = '✅';
    this.disabled = true;

    updateBalanceDisplay(STATE.balance + 10, true);
    showToast('🎯 Задание выполнено! +10 ⭐', 'win');
    spawnConfetti();
    vibrate('success');
});

document.getElementById('dailyBonus')?.addEventListener('click', function () {
    const lastClaim = localStorage.getItem('ds_daily');
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (lastClaim && now - parseInt(lastClaim) < oneDay) {
        const nextClaim = new Date(parseInt(lastClaim) + oneDay);
        const hours = Math.floor((nextClaim - now) / 3600000);
        const minutes = Math.floor(((nextClaim - now) % 3600000) / 60000);
        showToast(`⏰ Следующий бонус через ${hours}ч ${minutes}м`, 'info');
        return;
    }

    localStorage.setItem('ds_daily', now.toString());
    updateBalanceDisplay(STATE.balance + 15, true);
    showToast('📅 Ежедневный бонус! +15 ⭐', 'win');
    spawnConfetti();
    vibrate('success');

    this.textContent = '✅ Получено';
    this.disabled = true;
});

/* Инициализация */
function init() {
    const display = document.getElementById('balanceDisplay');
    if (display) display.textContent = STATE.balance;

    drawCrashGraph(0);
    ['reelInner1', 'reelInner2', 'reelInner3'].forEach(id => fillReel(id, 5));
    initRouletteTrack();

    if (tg) {
        const user = tg.initDataUnsafe?.user;
        if (user) {
            console.log(`[Duck Stars] User: ${user.first_name} (${user.id})`);
        }

        tg.BackButton?.onClick?.(() => {
            if (STATE.activeTab !== 'tasks') {
                switchTab('tasks');
                tg.BackButton.hide();
            }
        });
    }

    console.log('🦆 Duck Stars initialized!', {
        balance: STATE.balance,
        isNewPlayer: STATE.isNewPlayer,
        newPlayerGames: STATE.newPlayerGames,
        rtp: `${getRTP() * 100}%`
    });
}

document.addEventListener('DOMContentLoaded', init);
