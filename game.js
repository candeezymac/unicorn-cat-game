(() => {
  "use strict";

  // Logical maze size (in "rooms"). Actual grid is 2x+1 to fit walls between rooms.
  const LOGICAL_COLS = 6;
  const LOGICAL_ROWS = 8;
  const GRID_COLS = LOGICAL_COLS * 2 + 1;
  const GRID_ROWS = LOGICAL_ROWS * 2 + 1;
  const HEART_COUNT = 5;

  const canvas = document.getElementById("mazeCanvas");
  const ctx = canvas.getContext("2d");
  const heartsCollectedEl = document.getElementById("heartsCollected");
  const heartsTotalEl = document.getElementById("heartsTotal");
  const toastEl = document.getElementById("toast");
  const winOverlay = document.getElementById("winOverlay");
  const winStatsEl = document.getElementById("winStats");
  const newMazeBtn = document.getElementById("newMazeBtn");
  const playAgainBtn = document.getElementById("playAgainBtn");

  let cellSize = 32;
  let grid; // true = wall, false = open
  let hearts; // Set of "r,c" keys
  let heartsCollected = 0;
  let cat = { r: 1, c: 1 };
  let goal = { r: GRID_ROWS - 2, c: GRID_COLS - 2 };
  let moves = 0;
  let won = false;
  let toastTimer = null;

  function key(r, c) {
    return r + "," + c;
  }

  // --- Sound effects: synthesized with the Web Audio API, no external audio files ---
  let audioCtx = null;
  function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(ctx, { freq, freqEnd, start, duration, type = "sine", gain = 0.15, vibrato }) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (freqEnd !== undefined) {
      osc.frequency.linearRampToValueAtTime(freqEnd, start + duration);
    }
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = vibrato.rate;
      lfoGain.gain.value = vibrato.depth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(start + duration);
    }
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + Math.min(0.03, duration / 4));
    g.gain.linearRampToValueAtTime(0, start + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  }

  function playMeow() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    tone(ctx, { freq: 500, freqEnd: 760, start: now, duration: 0.1, type: "sawtooth", gain: 0.1 });
    tone(ctx, { freq: 760, freqEnd: 380, start: now + 0.08, duration: 0.22, type: "sawtooth", gain: 0.13, vibrato: { rate: 18, depth: 25 } });
  }

  function playUnlock() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    tone(ctx, { freq: 900, start: now, duration: 0.05, type: "square", gain: 0.08 });
    tone(ctx, { freq: 1100, start: now + 0.09, duration: 0.05, type: "square", gain: 0.08 });
    tone(ctx, { freq: 500, freqEnd: 1000, start: now + 0.2, duration: 0.35, type: "triangle", gain: 0.15 });
  }

  function playWinJingle() {
    const ctx = getAudioCtx();
    if (ctx) {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        tone(ctx, { freq, start: now + i * 0.14, duration: 0.4, type: "triangle", gain: 0.13 });
      });
      tone(ctx, { freq: 1568, start: now + 0.5, duration: 0.6, type: "sine", gain: 0.07 });
    }
    if ("speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance("Yay!");
      utter.pitch = 1.6;
      utter.rate = 1.1;
      window.speechSynthesis.speak(utter);
    }
  }

  // Recursive backtracker maze generation on the logical grid.
  function generateMaze() {
    const g = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      g.push(new Array(GRID_COLS).fill(true));
    }

    const visited = [];
    for (let r = 0; r < LOGICAL_ROWS; r++) {
      visited.push(new Array(LOGICAL_COLS).fill(false));
    }

    function toGrid(lr, lc) {
      return { r: lr * 2 + 1, c: lc * 2 + 1 };
    }

    const stack = [{ r: 0, c: 0 }];
    visited[0][0] = true;
    const start = toGrid(0, 0);
    g[start.r][start.c] = false;

    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    while (stack.length) {
      const cur = stack[stack.length - 1];
      const options = [];
      for (const d of dirs) {
        const nr = cur.r + d.dr;
        const nc = cur.c + d.dc;
        if (nr >= 0 && nr < LOGICAL_ROWS && nc >= 0 && nc < LOGICAL_COLS && !visited[nr][nc]) {
          options.push({ nr, nc, d });
        }
      }
      if (options.length === 0) {
        stack.pop();
        continue;
      }
      const choice = options[Math.floor(Math.random() * options.length)];
      visited[choice.nr][choice.nc] = true;
      const curGrid = toGrid(cur.r, cur.c);
      const nextGrid = toGrid(choice.nr, choice.nc);
      const wallR = curGrid.r + choice.d.dr;
      const wallC = curGrid.c + choice.d.dc;
      g[wallR][wallC] = false;
      g[nextGrid.r][nextGrid.c] = false;
      stack.push({ r: choice.nr, c: choice.nc });
    }

    return g;
  }

  function openCells() {
    const cells = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!grid[r][c]) cells.push({ r, c });
      }
    }
    return cells;
  }

  function reachableDistances(start, blocked) {
    // BFS distances from `start`, treating `blocked` (the locked gate) as a wall.
    // The gate is impassable until every heart is collected, so hearts must only
    // be placed where the cat can reach them without ever crossing it.
    const dist = new Array(GRID_ROWS);
    for (let r = 0; r < GRID_ROWS; r++) dist[r] = new Array(GRID_COLS).fill(-1);
    const q = [start];
    dist[start.r][start.c] = 0;
    let head = 0;
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    while (head < q.length) {
      const cur = q[head++];
      for (const [dr, dc] of deltas) {
        const nr = cur.r + dr;
        const nc = cur.c + dc;
        if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
        if (grid[nr][nc]) continue;
        if (nr === blocked.r && nc === blocked.c) continue;
        if (dist[nr][nc] !== -1) continue;
        dist[nr][nc] = dist[cur.r][cur.c] + 1;
        q.push({ r: nr, c: nc });
      }
    }
    return dist;
  }

  function setupGame() {
    grid = generateMaze();
    cat = { r: 1, c: 1 };
    goal = { r: GRID_ROWS - 2, c: GRID_COLS - 2 };
    moves = 0;
    won = false;
    heartsCollected = 0;

    const dist = reachableDistances(cat, goal);
    let cells = openCells().filter(
      (cell) => dist[cell.r][cell.c] !== -1 && !(cell.r === cat.r && cell.c === cat.c)
    );
    // Prefer hearts that are meaningfully far from the start, for a bit of exploration.
    cells.sort((a, b) => dist[b.r][b.c] - dist[a.r][a.c]);
    const pool = cells.slice(0, Math.max(HEART_COUNT * 3, cells.length));
    hearts = new Set();
    while (hearts.size < Math.min(HEART_COUNT, pool.length)) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      hearts.add(key(pick.r, pick.c));
    }

    heartsTotalEl.textContent = hearts.size;
    heartsCollectedEl.textContent = "0";
    winOverlay.classList.add("hidden");
    resizeCanvas();
    draw();
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 1400);
  }

  function resizeCanvas() {
    const gameArea = document.getElementById("gameArea");
    const availW = gameArea.clientWidth - 8;
    const availH = gameArea.clientHeight - 8;
    cellSize = Math.floor(Math.min(availW / GRID_COLS, availH / GRID_ROWS));
    cellSize = Math.max(cellSize, 14);
    canvas.width = cellSize * GRID_COLS;
    canvas.height = cellSize * GRID_ROWS;
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const x = c * cellSize;
        const y = r * cellSize;
        if (grid[r][c]) {
          ctx.fillStyle = "#c9a3e0";
          ctx.fillRect(x, y, cellSize, cellSize);
        } else {
          ctx.fillStyle = "#fff8fc";
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }

    // Goal cell styling: locked gate until all hearts collected.
    const allHeartsCollected = heartsCollected >= totalHearts();
    const gx = goal.c * cellSize;
    const gy = goal.r * cellSize;
    ctx.fillStyle = allHeartsCollected ? "#d8ffe0" : "#ffe1e1";
    ctx.fillRect(gx, gy, cellSize, cellSize);
    ctx.font = `${cellSize * 0.7}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(allHeartsCollected ? "🦄" : "🔒🦄", gx + cellSize / 2, gy + cellSize / 2);

    // Hearts
    ctx.font = `${cellSize * 0.6}px serif`;
    for (const hkey of hearts) {
      const [hr, hc] = hkey.split(",").map(Number);
      ctx.fillText("💗", hc * cellSize + cellSize / 2, hr * cellSize + cellSize / 2);
    }

    // Cat
    ctx.font = `${cellSize * 0.72}px serif`;
    ctx.fillText("🐱", cat.c * cellSize + cellSize / 2, cat.r * cellSize + cellSize / 2);
  }

  function totalHearts() {
    return Number(heartsTotalEl.textContent) || hearts.size;
  }

  function tryMove(dir) {
    if (won) return;
    let { r, c } = cat;
    if (dir === "up") r -= 1;
    else if (dir === "down") r += 1;
    else if (dir === "left") c -= 1;
    else if (dir === "right") c += 1;

    if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return;
    if (grid[r][c]) return; // wall

    if (r === goal.r && c === goal.c && heartsCollected < totalHearts()) {
      const remaining = totalHearts() - heartsCollected;
      showToast(`Need ${remaining} more heart${remaining === 1 ? "" : "s"} 💗`);
      return;
    }

    cat = { r, c };
    moves += 1;

    const hkey = key(r, c);
    if (hearts.has(hkey)) {
      hearts.delete(hkey);
      heartsCollected += 1;
      heartsCollectedEl.textContent = heartsCollected;
      showToast("Heart collected! 💗");
      playMeow();
      if (heartsCollected >= totalHearts()) {
        playUnlock();
      }
    }

    if (r === goal.r && c === goal.c && heartsCollected >= totalHearts()) {
      won = true;
      winStatsEl.textContent = `Freed with ${moves} moves and all ${totalHearts()} hearts!`;
      playWinJingle();
      setTimeout(() => winOverlay.classList.remove("hidden"), 200);
    }

    draw();
  }

  // --- Input: keyboard (desktop testing) ---
  window.addEventListener("keydown", (e) => {
    const map = {
      ArrowUp: "up", w: "up", W: "up",
      ArrowDown: "down", s: "down", S: "down",
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
    };
    if (map[e.key]) {
      e.preventDefault();
      tryMove(map[e.key]);
    }
  });

  // --- Input: on-screen D-pad (touch + click), with hold-to-repeat ---
  let repeatTimer = null;
  let repeatDelay = null;

  function startRepeat(dir) {
    tryMove(dir);
    clearTimeout(repeatDelay);
    clearInterval(repeatTimer);
    repeatDelay = setTimeout(() => {
      repeatTimer = setInterval(() => tryMove(dir), 160);
    }, 350);
  }

  function stopRepeat() {
    clearTimeout(repeatDelay);
    clearInterval(repeatTimer);
  }

  document.querySelectorAll(".dpad-btn").forEach((btn) => {
    const dir = btn.dataset.dir;
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      startRepeat(dir);
    }, { passive: false });
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      stopRepeat();
    }, { passive: false });
    btn.addEventListener("touchcancel", stopRepeat);
    btn.addEventListener("mousedown", () => startRepeat(dir));
    btn.addEventListener("mouseup", stopRepeat);
    btn.addEventListener("mouseleave", stopRepeat);
  });

  // --- Input: swipe on the maze itself ---
  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 24;
    if (Math.max(absX, absY) < threshold) {
      touchStart = null;
      return;
    }
    if (absX > absY) {
      tryMove(dx > 0 ? "right" : "left");
    } else {
      tryMove(dy > 0 ? "down" : "up");
    }
    touchStart = null;
  }, { passive: true });

  newMazeBtn.addEventListener("click", setupGame);
  playAgainBtn.addEventListener("click", setupGame);
  window.addEventListener("resize", resizeCanvas);

  setupGame();
})();
