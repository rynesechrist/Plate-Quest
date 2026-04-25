const states = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "DC", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"];

let currentGame = null;
let holdTimer = null;
let canvas, ctx, particles = [];
const HOLD_DURATION = 3000; // 3 seconds
let fireworksTriggered = false;
let animatingFireworks = false;
let countdownInterval = null;
let startX, startY; // Track where the finger first touched
const MOVE_THRESHOLD = 10; // Pixels allowed before it's considered a "drag"
let wasUndoTriggered = false;

const THEMES = {
    green:  { accent: '#00e676', accentRgb: '0, 230, 118',   cyan: '#00bcd4', cyanRgb: '0, 188, 212' },
    blue:   { accent: '#448aff', accentRgb: '68, 138, 255',  cyan: '#00b0ff', cyanRgb: '0, 176, 255' },
    pink:   { accent: '#f06292', accentRgb: '240, 98, 146',  cyan: '#ce93d8', cyanRgb: '206, 147, 216' },
    yellow: { accent: '#ffee58', accentRgb: '255, 238, 88',  cyan: '#ffa726', cyanRgb: '255, 167, 38' },
    red:    { accent: '#ff5252', accentRgb: '255, 82, 82',   cyan: '#ff4081', cyanRgb: '255, 64, 129' },
    purple: { accent: '#b388ff', accentRgb: '179, 136, 255', cyan: '#ea80fc', cyanRgb: '234, 128, 252' },
};

function applyTheme(name) {
    const theme = THEMES[name] || THEMES.green;
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-rgb', theme.accentRgb);
    root.style.setProperty('--cyan', theme.cyan);
    root.style.setProperty('--cyan-rgb', theme.cyanRgb);
    localStorage.setItem('plateTheme', name);
    document.querySelectorAll('.theme-swatch').forEach(el => {
        el.classList.toggle('active', el.dataset.theme === name);
    });
}

function loadTheme() {
    const saved = localStorage.getItem('plateTheme') || 'green';
    applyTheme(saved);
}

window.onload = () => {
    loadTheme();
    // Migrate legacy single activeGame to activeGames array
    const oldGame = localStorage.getItem('activeGame');
    if (oldGame) {
        try {
            const parsed = JSON.parse(oldGame);
            if (!parsed.id) parsed.id = parsed.startTime;
            const games = getActiveGames();
            if (!games.find(g => g.id === parsed.id)) {
                games.push(parsed);
                saveActiveGames(games);
            }
        } catch {}
        localStorage.removeItem('activeGame');
    }
    showMenu();
};

function getActiveGames() {
    try { return JSON.parse(localStorage.getItem('activeGames') || '[]'); } catch { return []; }
}

function saveActiveGames(games) {
    localStorage.setItem('activeGames', JSON.stringify(games));
}

async function startGame() {
    const games = getActiveGames();
    if (games.length >= 5) return;

    const setup = await promptGameSetup();
    if (setup === null) return;

    const id = new Date().getTime();
    currentGame = {
        id,
        name: setup.name || (new Date().toLocaleString('default', { month: 'long' }) + ' Run'),
        startTime: id,
        found: [],
        log: [],
        status: 'In Progress',
        excludedStates: setup.skipIslands ? ['Alaska', 'Hawaii'] : [],
        timeLimit: setup.timeLimit || null,
        expiry: setup.timeLimit ? id + setup.timeLimit : null
    };
    saveActiveProgress();
    fireworksTriggered = false;
    particles = [];
    resumeGame();
}

function selectGame(id) {
    const games = getActiveGames();
    const found = games.find(g => g.id === id);
    if (!found) return;
    currentGame = {...found};
    if (isExpired(currentGame)) {
        archiveGame('Timed Out');
        showMenu();
        return;
    }
    fireworksTriggered = false;
    particles = [];
    resumeGame();
}

async function renameRun() {
    const newName = await promptRename(currentGame.name);
    if (newName === null) return;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    currentGame.name = newName.trim() || (months[new Date().getMonth()] + ' Run');
    saveActiveProgress();
    const nameEl = document.getElementById('run-name-display');
    if (nameEl) nameEl.innerText = currentGame.name;
}

function promptRename(currentName) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const input = document.getElementById('modal-input');
        const checkboxWrap = document.getElementById('modal-checkbox-wrap');
        const timeWrap = document.getElementById('modal-time-wrap');
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        titleEl.innerText = 'Rename Run';
        messageEl.innerText = 'Enter a new name for this run:';
        input.value = currentName || '';
        input.classList.remove('hidden');
        checkboxWrap.classList.add('hidden');
        timeWrap.classList.add('hidden');
        confirmBtn.innerText = 'Save';
        cancelBtn.innerText = 'Cancel';
        modal.classList.remove('hidden');
        input.focus();
        input.select();

        const onEnter = (e) => { if (e.key === 'Enter') confirmBtn.click(); };
        input.addEventListener('keydown', onEnter);

        const cleanup = () => {
            input.removeEventListener('keydown', onEnter);
            input.classList.add('hidden');
            confirmBtn.innerText = 'Yes, Proceed';
            modal.classList.add('hidden');
        };

        confirmBtn.onclick = () => { cleanup(); resolve(input.value); };
        cancelBtn.onclick = () => { cleanup(); resolve(null); };
    });
}

function resumeGame() {
    renderGrid();
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('stats-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    const nameEl = document.getElementById('run-name-display');
    if (nameEl) nameEl.innerText = currentGame.name || 'Unnamed Run';

    const startObj = new Date(currentGame.startTime);
    document.getElementById('start-date-display').innerText = `Started: ${startObj.toLocaleDateString()}`;

    startCountdown();
    updateStats();
}

function isExpired(game) {
    return game.expiry && new Date().getTime() >= game.expiry;
}

function formatCountdown(ms) {
    if (ms <= 0) return '0s';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function startCountdown() {
    clearInterval(countdownInterval);
    const banner = document.getElementById('time-limit-banner');

    if (!currentGame.expiry) {
        banner.classList.add('hidden');
        return;
    }

    function tick() {
        const remaining = currentGame.expiry - new Date().getTime();
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            banner.classList.add('hidden');
            archiveGame('Timed Out');
            showMenu();
            return;
        }
        const urgent = remaining < 3600000; // under 1 hour
        banner.className = 'time-limit-banner' + (urgent ? ' urgent' : '');
        banner.textContent = `⏱ ${formatCountdown(remaining)} remaining`;
    }

    tick();
    countdownInterval = setInterval(tick, 1000);
}

function updateStats() {
    if (!currentGame) return;

    const now = new Date().getTime();
    const diffInMs = now - currentGame.startTime;
    const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    const dayText = days === 0 ? "< 1 Day" : `${days} Days`;
    document.getElementById('active-days').innerText = `Active: ${dayText}`;

    const count = currentGame.found.length;
    const total = getGameStates().length;
    document.getElementById('counter').innerText = `${count} / ${total}`;

    // REFRESH RECENT FINDS
    updateRecentList();

    // UPDATE THE AVERAGE DISPLAY
    const avgDisplay = document.getElementById('avg-time');
    avgDisplay.innerText = `Avg: ${calculateAverageTime()}`;

    // UPDATE PROGRESS BAR
    const percentage = Math.round((count / total) * 100);
    document.getElementById('progress-bar').style.width = `${percentage}%`;
    document.getElementById('progress-text').innerText = `${percentage}%`;

    if (count === total) {
        document.getElementById('complete-btn').classList.remove('hidden');
        document.getElementById('abandon-btn').classList.add('hidden');

        // TRIGGER FIREWORKS
            if (!fireworksTriggered) {
                launchFireworks();
                fireworksTriggered = true;
                // Short vibration for the "explosion"
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]); 
            }
    } else {
        document.getElementById('complete-btn').classList.add('hidden');
        document.getElementById('abandon-btn').classList.remove('hidden');
    }
}

function togglePlate(state, element) {
    const index = currentGame.found.indexOf(state);

    if (index > -1) {
        // UNTAP
        currentGame.found.splice(index, 1);
        currentGame.log = currentGame.log.filter(entry => entry.state !== state);
        element.classList.remove('found');
        const dateLabel = element.querySelector('.found-date');
        if (dateLabel) dateLabel.remove();
    } else {
        // TAP
        const now = new Date().getTime();
        currentGame.found.push(state);
        currentGame.log.push({ state: state, time: now });
        element.classList.add('found');
        
        const dateSpan = document.createElement('span');
        dateSpan.className = 'found-date';
        dateSpan.innerText = new Date(now).toLocaleDateString();
        element.appendChild(dateSpan);
    }

    saveActiveProgress();
    updateStats();
}

function getGameStates() {
    const excluded = currentGame.excludedStates || [];
    return states.filter(s => !excluded.includes(s));
}

function renderGrid() {
    const grid = document.getElementById('plate-grid');
    grid.innerHTML = '';

    getGameStates().forEach(state => {
        const logEntry = currentGame.log.find(entry => entry.state === state);
        const isFound = !!logEntry;
        
        const btn = document.createElement('div');
        btn.className = `plate-card ${isFound ? 'found' : ''}`;

// --- ADD PLATE BACKGROUND IF FOUND ---
        if (isFound) {
            // We format the state name for the URL (e.g., "New York" -> "new-york")
            const stateUrlName = state.toLowerCase().replace(/\s+/g, '-');
            
            // Using a reliable placeholder/plate API (Example: State-Plates CDN)
            // Note: You can replace this URL with your own local images later
            btn.style.backgroundImage = `url('plates/${stateUrlName}.jpg')`;
        }

// --- ADD THE TIMER SVG ---
        const timerHTML = `
            <div class="hold-timer-container">
                <svg class="timer-svg" viewBox="0 0 36 36">
                    <circle class="timer-circle-bg" cx="18" cy="18" r="16"></circle>
                    <circle class="timer-circle-progress" cx="18" cy="18" r="16"></circle>
                </svg>
            </div>
        `;
        btn.innerHTML = timerHTML;


        const nameSpan = document.createElement('span');
        nameSpan.innerText = state;

        btn.appendChild(nameSpan);
        
        if (isFound) {
            const dateSpan = document.createElement('span');
            dateSpan.className = 'found-date';
            dateSpan.innerText = new Date(logEntry.time).toLocaleDateString();
            btn.appendChild(dateSpan);
        }

        // --- FIXED INPUT LOGIC ---
        btn.onpointerdown = (e) => {
            startX = e.clientX;
            startY = e.clientY;
            wasUndoTriggered = false; // Reset the lock on every new touch
            startHold(e, state, btn);
        };

        btn.onpointermove = (e) => {
            if (Math.abs(e.clientX - startX) > MOVE_THRESHOLD || 
                Math.abs(e.clientY - startY) > MOVE_THRESHOLD) {
                cancelHold(e, state, btn);
            }
        };

        btn.onpointerup = (e) => {
            const isFound = currentGame.found.includes(state);
            
            // Logic: Only mark as found if:
            // 1. It's not already found
            // 2. We didn't just drag/scroll
            // 3. We didn't just trigger an UNDO (the safety lock)
            if (!isFound && !btn.classList.contains('drag-cancelled') && !wasUndoTriggered) {
                markAsFound(state, btn);
            }
            
            cancelHold(e, state, btn);
        };

        btn.onpointerleave = (e) => cancelHold(e, state, btn);
        
        grid.appendChild(btn);
    });
}

function archiveGame(finalStatus) {
    currentGame.status = finalStatus;
    currentGame.endTime = new Date().getTime();
    currentGame.metrics = calculateMetrics(currentGame);

    let history; try { history = JSON.parse(localStorage.getItem('plateHistory') || '[]'); } catch { history = []; }
    history.push({...currentGame});
    localStorage.setItem('plateHistory', JSON.stringify(history));
    
    const games = getActiveGames().filter(g => g.id !== currentGame.id);
    saveActiveGames(games);
    currentGame = null;
}

function calculateMetrics(game) {
    const log = [...game.log].sort((a, b) => a.time - b.time);
    const start = game.startTime;
    const end = game.endTime || new Date().getTime();
    const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));

    if (log.length === 0) return { startStr: new Date(start).toLocaleDateString(), endStr: new Date(end).toLocaleDateString(), totalDays: diffDays, firstPlate: 'None', lastPlate: 'None', bestDay: {count:0, date:'N/A'}, maxGapDays: 0 };

    const dayCounts = {};
    log.forEach(e => { const d = new Date(e.time).toLocaleDateString(); dayCounts[d] = (dayCounts[d]||0)+1; });
    let bestDay = { date: 'N/A', count: 0 };
    for (let d in dayCounts) { if (dayCounts[d] > bestDay.count) bestDay = { date: d, count: dayCounts[d] }; }

    let maxGapMs = log[0].time - start;
    for (let i = 1; i < log.length; i++) {
        const gap = log[i].time - log[i - 1].time;
        if (gap > maxGapMs) maxGapMs = gap;
    }

    return {
        startStr: new Date(start).toLocaleDateString(),
        endStr: new Date(end).toLocaleDateString(),
        firstPlate: log[0].state,
        lastPlate: log[log.length-1].state,
        totalDays: diffDays,
        bestDay,
        maxGapDays: (maxGapMs / (1000 * 60 * 60 * 24)).toFixed(1)
    };
}

function loadHistory() {
    const list = document.getElementById('history-list');
    const clearBtn = document.getElementById('clear-btn');
    let historyData; try { historyData = JSON.parse(localStorage.getItem('plateHistory') || '[]'); } catch { historyData = []; }
    
    if (historyData.length === 0) {
        list.innerHTML = `
            <li class="history-empty">
                <div class="history-empty-icon">🗺️</div>
                <div class="history-empty-title">No quests completed yet</div>
                <div class="history-empty-sub">Finish or abandon a game and it'll show up here.</div>
            </li>`;
        if (clearBtn) clearBtn.classList.add('hidden');
        return;
    }

    if (clearBtn) clearBtn.classList.remove('hidden');
    const reversed = [...historyData].reverse();
    list.innerHTML = reversed.map((game, i) => {
        const m = game.metrics;
        const color = game.status === 'Completed' ? 'var(--accent)' : game.status === 'Timed Out' ? '#f4a83a' : '#cf6679';
        return `<li class="history-card" style="border-left: 5px solid ${color};">
            <button class="delete-run-btn" onclick="deleteRun(${game.startTime})" title="Delete this run">🗑</button>
            <div style="font-weight: bold; font-size: 1rem; margin-bottom: 2px;">
                ${game.name ? `<span style="color:#fff;">${game.name}</span><span style="color:#888;"> - </span>` : ''}<span style="color:${color};">${game.status}</span>${game.timeLimit ? `<span style="color:var(--cyan); font-size:0.75rem; font-weight:normal; margin-left:6px;">⏱ ${game.timeLimit === 86400000 ? '24h' : game.timeLimit === 259200000 ? '72h' : Math.round(game.timeLimit / 3600000) + 'h'}</span>` : ''}
            </div>
            <div>Start Date: ${m.startStr} - End Date: ${m.endStr} (${m.totalDays} Days)</div>
            <div>${game.found.length}/${51 - (game.excludedStates || []).length} Plates | First: ${m.firstPlate} | Last: ${m.lastPlate}</div>
            <div style="font-size: 0.75rem; color: #888;">Best Day: ${m.bestDay.count} on ${m.bestDay.date} | Longest Gap: ${m.maxGapDays} days</div>
        </li>`;
    }).join('');
}

async function deleteRun(startTime) {
    const confirmed = await customConfirm(
        "Delete This Run?",
        "This will permanently remove this game from your history. This cannot be undone."
    );
    if (confirmed) {
        let historyData; try { historyData = JSON.parse(localStorage.getItem('plateHistory') || '[]'); } catch { historyData = []; }
        const filtered = historyData.filter(g => g.startTime !== startTime);
        localStorage.setItem('plateHistory', JSON.stringify(filtered));
        loadHistory();
    }
}

async function clearHistory() {
    const confirmed = await customConfirm(
        "Wipe All Data?", 
        "This will permanently delete every past game and stat. This action cannot be undone."
    );
    if (confirmed) {
        localStorage.removeItem('plateHistory');
        loadHistory();
    }
}

function goToMenu() {
    showMenu();
}

async function abandonGame() {
    const confirmed = await customConfirm(
        "Abandon Quest?", 
        "This will end your current run and log your progress in history. Are you ready to head back to the menu?"
    );
    if (confirmed) {
        archiveGame('Abandoned');
        showMenu();
    }
}

async function completeGame() {
    const confirmed = await customConfirm(
        "Quest Complete!", 
        "You've spotted all 51 plates! Ready to archive this victory and save your stats?"
    );
    if (confirmed) {
        archiveGame('Completed');
        showMenu();
    }
}

function showMenu() {
    clearInterval(countdownInterval);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('menu-screen').classList.remove('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('stats-screen').classList.add('hidden');

    // Auto-abandon any expired timed games
    const games = getActiveGames();
    const now = new Date().getTime();
    let anyExpired = false;
    games.forEach(g => {
        if (g.expiry && now >= g.expiry) {
            currentGame = {...g};
            archiveGame('Timed Out');
            anyExpired = true;
        }
    });
    if (anyExpired) currentGame = null;

    renderActiveGames();
    loadHistory();
}

function formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const days  = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins  = Math.floor((totalSec % 3600) / 60);
    const secs  = totalSec % 60;
    if (days > 0)  return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0)  return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function showStats() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('stats-screen').classList.remove('hidden');

    let history;
    try { history = JSON.parse(localStorage.getItem('plateHistory') || '[]'); } catch { history = []; }

    const content = document.getElementById('stats-content');

    if (history.length === 0) {
        content.innerHTML = '<p class="stats-empty">Complete a game to see your stats here.</p>';
        return;
    }

    // Fastest completion (completed games only)
    const completed = history.filter(g => g.status === 'Completed' && g.endTime);
    let bestCompletionHTML = '<div class="stat-empty-note">No completed games yet.</div>';
    if (completed.length > 0) {
        const best = completed.reduce((a, b) =>
            (b.endTime - b.startTime) < (a.endTime - a.startTime) ? b : a
        );
        const duration = formatDuration(best.endTime - best.startTime);
        const total = 51 - (best.excludedStates || []).length;
        bestCompletionHTML = `
            <div class="stat-best-card">
                <div class="stat-best-label">Best Completion Time</div>
                <div class="stat-best-value">${duration}</div>
                <div class="stat-best-sub">${best.name || 'Unnamed Run'} &middot; ${total} states</div>
            </div>`;
    }

    // Fastest find per state across all games
    const fastestPerState = {};
    history.forEach(game => {
        (game.log || []).forEach(entry => {
            const elapsed = entry.time - game.startTime;
            if (elapsed > 0 && (!fastestPerState[entry.state] || elapsed < fastestPerState[entry.state])) {
                fastestPerState[entry.state] = elapsed;
            }
        });
    });

    const foundStates = states.filter(s => fastestPerState[s] !== undefined);
    const unfoundStates = states.filter(s => fastestPerState[s] === undefined);

    const sortedFound = foundStates.sort((a, b) => fastestPerState[a] - fastestPerState[b]);

    const rowsHTML = sortedFound.map((state, i) => `
        <div class="stat-row">
            <span class="stat-rank">#${i + 1}</span>
            <span class="stat-state">${state}</span>
            <span class="stat-time">${formatDuration(fastestPerState[state])}</span>
        </div>
    `).join('');

    const unfoundHTML = unfoundStates.length > 0 ? `
        <div class="stat-unfound-label">Never Found</div>
        <div class="stat-unfound-list">${unfoundStates.map(s => `<span class="stat-unfound-tag">${s}</span>`).join('')}</div>
    ` : '';

    content.innerHTML = `
        ${bestCompletionHTML}
        <h3>Fastest State Finds</h3>
        <div class="stat-rows">${rowsHTML}</div>
        ${unfoundHTML}
    `;
}

function renderActiveGames() {
    const games = getActiveGames();
    const container = document.getElementById('active-games-list');
    const startBtn = document.getElementById('start-btn');

    container.innerHTML = '';
    games.forEach(game => {
        const total = 51 - (game.excludedStates || []).length;
        const pct = Math.round((game.found.length / total) * 100);
        const started = new Date(game.startTime).toLocaleDateString();
        const card = document.createElement('div');
        card.className = 'active-game-card';
        card.innerHTML = `
            <div class="active-game-info">
                <div class="active-game-name">${game.name || 'Unnamed Run'}</div>
                <div class="active-game-stats">${game.found.length}/${total} plates &middot; Started ${started}${game.expiry ? ` &middot; ⏱ ${formatCountdown(game.expiry - new Date().getTime())} left` : ''}</div>
                <div class="active-game-progress">
                    <div class="active-game-progress-fill" style="width: ${pct}%"></div>
                </div>
            </div>
            <button class="active-game-resume-btn" onclick="selectGame(${game.id})">Resume</button>
        `;
        container.appendChild(card);
    });

    if (games.length >= 5) {
        startBtn.disabled = true;
        startBtn.innerText = 'Max Games Reached (5/5)';
        startBtn.style.opacity = '0.4';
    } else {
        startBtn.disabled = false;
        startBtn.innerText = 'Start New Game';
        startBtn.style.opacity = '1';
    }
}

function saveActiveProgress() {
    const games = getActiveGames();
    const idx = games.findIndex(g => g.id === currentGame.id);
    if (idx > -1) {
        games[idx] = {...currentGame};
    } else {
        games.push({...currentGame});
    }
    saveActiveGames(games);
}

function startHold(event, state, element) {
    element.classList.remove('drag-cancelled');
    const isFound = currentGame.found.includes(state);

    if (isFound) {
        element.classList.add('holding');
        holdTimer = setTimeout(() => {
            undoPlate(state, element);
        }, HOLD_DURATION);
    }
}

function cancelHold(event, state, element) {
    clearTimeout(holdTimer);
    element.classList.remove('holding');

    // If this was a move, flag it so 'onpointerup' doesn't trigger a click
    if (event.type === 'pointermove') {
        element.classList.add('drag-cancelled');
    }
}

function markAsFound(state, element) {
    if (currentGame.found.includes(state)) return;
    
    const now = new Date().getTime();
    currentGame.found.push(state);
    currentGame.log.push({ state: state, time: now });

    // Trigger Animation
    element.classList.add('found');
    element.classList.add('animate-pop');

    // Remove animation class after it finishes so it can be re-triggered
    setTimeout(() => element.classList.remove('animate-pop'), 300);

    // --- ADD PLATE BACKGROUND IF FOUND ---
    const stateUrlName = state.toLowerCase().replace(/\s+/g, '-');
    element.style.backgroundImage = `url('plates/${stateUrlName}.jpg')`;
    
    // element.classList.add('found');
    const dateSpan = document.createElement('span');
    dateSpan.className = 'found-date';
    dateSpan.innerText = new Date(now).toLocaleDateString();
    element.appendChild(dateSpan);

    saveActiveProgress();
    updateStats();
}

function undoPlate(state, element) {
    const index = currentGame.found.indexOf(state);
    if (index > -1) {
        wasUndoTriggered = true;

        currentGame.found.splice(index, 1);
        currentGame.log = currentGame.log.filter(entry => entry.state !== state);
        
        element.classList.remove('found');
        element.classList.remove('holding');
        element.style.backgroundImage = 'none';

        const dateLabel = element.querySelector('.found-date');
        if (dateLabel) dateLabel.remove();
        
        saveActiveProgress();
        updateStats();
        
        // Brief vibration to confirm undo (works on many Androids)
        if (navigator.vibrate) navigator.vibrate(100);
    }
}

// REUSABLE CUSTOM CONFIRM FUNCTION
function promptGameSetup() {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const input = document.getElementById('modal-input');
        const checkboxWrap = document.getElementById('modal-checkbox-wrap');
        const checkbox = document.getElementById('modal-checkbox');
        const timeWrap = document.getElementById('modal-time-wrap');
        const timeOpts = timeWrap.querySelectorAll('.time-opt');
        const customHoursInput = document.getElementById('modal-custom-hours');
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        titleEl.innerText = 'New Quest';
        messageEl.innerText = 'Name your run and choose your options:';
        input.value = '';
        checkbox.checked = false;
        customHoursInput.value = '';
        input.classList.remove('hidden');
        checkboxWrap.classList.remove('hidden');
        timeWrap.classList.remove('hidden');

        // Reset time options to "None"
        timeOpts.forEach(btn => {
            btn.classList.remove('active');
            btn.onclick = () => {
                timeOpts.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                customHoursInput.value = '';
            };
        });
        timeOpts[0].classList.add('active');

        // Typing a custom value deselects preset buttons
        customHoursInput.oninput = () => {
            if (customHoursInput.value) {
                timeOpts.forEach(b => b.classList.remove('active'));
            } else {
                timeOpts[0].classList.add('active');
            }
        };

        confirmBtn.innerText = 'Start Quest';
        cancelBtn.innerText = 'Cancel';
        modal.classList.remove('hidden');
        input.focus();

        const onEnter = (e) => { if (e.key === 'Enter') confirmBtn.click(); };
        input.addEventListener('keydown', onEnter);

        const cleanup = () => {
            input.removeEventListener('keydown', onEnter);
            customHoursInput.oninput = null;
            input.classList.add('hidden');
            checkboxWrap.classList.add('hidden');
            timeWrap.classList.add('hidden');
            confirmBtn.innerText = 'Yes, Proceed';
            cancelBtn.innerText = 'Cancel';
            modal.classList.add('hidden');
        };

        confirmBtn.onclick = () => {
            let timeLimit = null;
            const customHours = parseInt(customHoursInput.value);
            if (customHoursInput.value && customHours >= 1 && customHours <= 500) {
                timeLimit = customHours * 3600000;
            } else {
                const activeOpt = timeWrap.querySelector('.time-opt.active');
                timeLimit = activeOpt ? parseInt(activeOpt.dataset.value) || null : null;
            }
            const result = { name: input.value.trim(), skipIslands: checkbox.checked, timeLimit };
            cleanup();
            resolve(result);
        };
        cancelBtn.onclick = () => {
            cleanup();
            resolve(null);
        };
    });
}

function customConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        titleEl.innerText = title;
        messageEl.innerText = message;
        modal.classList.remove('hidden');

        confirmBtn.onclick = () => {
            modal.classList.add('hidden');
            resolve(true);
        };
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            resolve(false);
        };
    });
}

function initFireworks() {
    canvas = document.getElementById('fireworks-canvas');
    ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function createParticle(x, y) {
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim() || '#00e676';
    const cyan = style.getPropertyValue('--cyan').trim() || '#00bcd4';
    const colors = [cyan, '#ffd700', accent, '#ff4081', '#ffffff'];
    return {
        x, y,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 5 + 2,
        friction: 0.95,
        gravity: 0.2,
        alpha: 1,
        decay: Math.random() * 0.015 + 0.015
    };
}

function launchFireworks() {
    initFireworks();

    let burstCount = 0;
    const totalBursts = 12;

    function burst() {
        const x = Math.random() * canvas.width * 0.8 + canvas.width * 0.1;
        const y = Math.random() * canvas.height * 0.6 + canvas.height * 0.1;
        for (let i = 0; i < 120; i++) {
            particles.push(createParticle(x, y));
        }
        burstCount++;
        if (burstCount < totalBursts) {
            setTimeout(burst, 300 + Math.random() * 300);
        }
    }

    burst();
    if (!animatingFireworks) {
        animatingFireworks = true;
        animateFireworks();
    }
}

function animateFireworks() {
    if (particles.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animatingFireworks = false;
        return;
    }

    requestAnimationFrame(animateFireworks);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p, i) => {
        p.speed *= p.friction;
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed + p.gravity;
        p.alpha -= p.decay;

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();

        if (p.alpha <= 0) particles.splice(i, 1);
    });
}

function updateRecentList() {
    const listEl = document.getElementById('recent-list');
    if (!currentGame || !listEl) return;

    // Get the last 5 entries from the log, then reverse so the newest is first
    const recent = [...currentGame.log]
        .sort((a, b) => b.time - a.time)
        .slice(0, 4);

    if (recent.length === 0) {
        listEl.innerHTML = '<span class="empty-recent">No plates found yet...</span>';
        return;
    }

    listEl.innerHTML = '';
    recent.forEach(entry => {
        const tag = document.createElement('div');
        tag.className = 'recent-tag';
        tag.innerText = entry.state;
        listEl.appendChild(tag);
    });
}

function calculateAverageTime() {
    if (!currentGame || currentGame.log.length < 2) return "--";

    // Sort log by time to ensure we're calculating gaps correctly
    const sortedLog = [...currentGame.log].sort((a, b) => a.time - b.time);
    
    let totalGap = 0;
    for (let i = 1; i < sortedLog.length; i++) {
        totalGap += (sortedLog[i].time - sortedLog[i-1].time);
    }

    const avgMs = totalGap / (sortedLog.length - 1);
    
    // Convert Ms to a readable format (Hours or Days)
    const avgHours = avgMs / (1000 * 60 * 60);
    
    if (avgHours < 1) {
        return Math.round(avgHours * 60) + "m"; // Show minutes if fast
    } else if (avgHours < 24) {
        return avgHours.toFixed(1) + "h"; // Show hours (e.g. 5.2h)
    } else {
        return (avgHours / 24).toFixed(1) + "d"; // Show days (e.g. 1.5d)
    }
}