(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const canvas = $("canvas");
  const nextCanvas = $("nextCanvas");

  if (!canvas || !nextCanvas) {
    console.error("Fruit Merge: Required canvas elements were not found.");
    return;
  }

  const ctx = canvas.getContext("2d");
  const nextCtx = nextCanvas.getContext("2d");

  const W = 360;
  const H = 560;
  const WALL = 12;
  const FLOOR = H - 12;
  const DANGER_LINE = 92;

  const fruits = [
    { name: "Cherry",   emoji: "🍒", r: 13, color: "#ff526d", points: 1 },
    { name: "Strawberry", emoji: "🍓", r: 18, color: "#ff466b", points: 3 },
    { name: "Grape",    emoji: "🍇", r: 23, color: "#9c69f5", points: 6 },
    { name: "Orange",   emoji: "🍊", r: 28, color: "#ff9d38", points: 10 },
    { name: "Apple",    emoji: "🍎", r: 34, color: "#ff5158", points: 15 },
    { name: "Pear",     emoji: "🍐", r: 40, color: "#a9df53", points: 21 },
    { name: "Peach",    emoji: "🍑", r: 46, color: "#ff9e9c", points: 28 },
    { name: "Pineapple",emoji: "🍍", r: 52, color: "#ffd34d", points: 36 },
    { name: "Melon",    emoji: "🍈", r: 59, color: "#76d99b", points: 45 },
    { name: "Watermelon",emoji: "🍉",r: 67, color: "#48c878", points: 60 }
  ];

  const STORAGE = {
    best: "fruitMergeBest_v1",
    sound: "fruitMergeSound_v1"
  };

  let objects = [];
  let score = 0;
  let best = loadBest();
  let currentFruit = 0;
  let nextFruit = randomFruit();
  let aimX = W / 2;
  let canDrop = true;
  let gameOver = false;
  let paused = false;
  let lastTime = 0;
  let accumulator = 0;
  let soundOn = readSoundSetting();
  let activePower = "";
  let powerCounts = { swap: 3, bomb: 2, grow: 2, mix: 2 };
  let audioContext = null;
  let gameStarted = false;
  let animationFrame = 0;
  let toastTimer = null;

  const GRAVITY = 1050;
  const RESTITUTION = 0.08;
  const MAX_DT = 1 / 30;

  function loadBest() {
    try {
      return Number(localStorage.getItem(STORAGE.best)) || 0;
    } catch (_) {
      return 0;
    }
  }

  function readSoundSetting() {
    try {
      return localStorage.getItem(STORAGE.sound) !== "off";
    } catch (_) {
      return true;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(STORAGE.best, String(best));
    } catch (_) {}
  }

  function randomFruit() {
    return Math.floor(Math.random() * 5);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function fruitRadius(level) {
    return fruits[clamp(level, 0, fruits.length - 1)].r;
  }

  function showToast(message) {
    const el = $("toast");
    if (!el) return;

    el.textContent = message;
    el.classList.remove("hidden");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 1900);
  }

  function updateText() {
    if ($("scoreVal")) $("scoreVal").textContent = score.toLocaleString();
    if ($("bestVal")) $("bestVal").textContent = best.toLocaleString();
    if ($("finalScore")) $("finalScore").textContent = score.toLocaleString();

    updatePowerButtons();
    updateShelf();
    drawNextFruit();
  }

  function updatePowerButtons() {
    const mapping = {
      swap: "cSwap",
      bomb: "cBomb",
      grow: "cGrow",
      mix: "cMix"
    };

    Object.keys(mapping).forEach((key) => {
      const count = $(mapping[key]);
      if (count) count.textContent = powerCounts[key];

      const button = $("b" + key.charAt(0).toUpperCase() + key.slice(1));
      if (button) {
        button.disabled =
          gameOver || paused || !gameStarted || powerCounts[key] <= 0;
      }
    });
  }

  function updateShelf() {
    const shelf = $("shelf");
    if (!shelf) return;

    shelf.innerHTML = "";

    fruits.forEach((fruit, index) => {
      const chip = document.createElement("div");
      chip.className = "fruit-chip";
      chip.innerHTML =
        "<span>" + fruit.emoji + "</span><span>" + fruit.name + "</span>";

      if (index === currentFruit) {
        chip.style.borderColor = fruit.color;
      }

      shelf.appendChild(chip);
    });
  }

  function drawNextFruit() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);

    const fruit = fruits[nextFruit];
    const cx = nextCanvas.width / 2;
    const cy = nextCanvas.height / 2;
    const r = Math.min(17, fruit.r * 0.55);

    nextCtx.save();
    nextCtx.beginPath();
    nextCtx.arc(cx, cy, r, 0, Math.PI * 2);
    nextCtx.fillStyle = fruit.color;
    nextCtx.fill();

    nextCtx.font = Math.max(13, r * 1.2) + "px system-ui";
    nextCtx.textAlign = "center";
    nextCtx.textBaseline = "middle";
    nextCtx.fillText(fruit.emoji, cx, cy + 1);
    nextCtx.restore();
  }

  function playSound(frequency = 440, duration = 0.07, type = "sine") {
    if (!soundOn) return;

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      if (!audioContext) audioContext = new AudioContextClass();

      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.045, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + duration
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) {}
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function drawFruit(x, y, level, alpha = 1) {
    const fruit = fruits[level];
    const r = fruit.r;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.shadowColor = fruit.color;
    ctx.shadowBlur = 8;

    const gradient = ctx.createRadialGradient(
      x - r * 0.32,
      y - r * 0.38,
      r * 0.08,
      x,
      y,
      r
    );

    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.12, fruit.color);
    gradient.addColorStop(1, shadeColor(fruit.color, -32));

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.48)";
    ctx.fill();

    ctx.font = Math.max(12, r * 1.05) + "px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fruit.emoji, x, y + r * 0.04);

    ctx.restore();
  }

  function shadeColor(hex, amount) {
    const raw = hex.replace("#", "");
    const num = parseInt(raw, 16);

    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 255) + amount;
    let b = (num & 255) + amount;

    r = clamp(r, 0, 255);
    g = clamp(g, 0, 255);
    b = clamp(b, 0, 255);

    return (
      "#" +
      ((1 << 24) + (r << 16) + (g << 8) + b)
        .toString(16)
        .slice(1)
    );
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#252b49");
    gradient.addColorStop(1, "#161a30");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(255,255,255,.035)";
    ctx.lineWidth = 1;

    for (let x = 24; x < W; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    for (let y = 24; y < H; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(WALL, DANGER_LINE);
    ctx.lineTo(W - WALL, DANGER_LINE);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("DANGER LINE", WALL + 4, DANGER_LINE - 7);

    ctx.fillStyle = "#343c5e";
    ctx.fillRect(0, 0, WALL, H);
    ctx.fillRect(W - WALL, 0, WALL, H);
    ctx.fillRect(0, FLOOR, W, H - FLOOR);

    ctx.fillStyle = "#495476";
    ctx.fillRect(0, FLOOR, W, 4);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    if (gameStarted && !gameOver && !paused && canDrop) {
      const r = fruitRadius(currentFruit);
      const x = clamp(aimX, WALL + r, W - WALL - r);

      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, Math.max(0, H - r * 2));
      ctx.stroke();
      ctx.setLineDash([]);

      drawFruit(x, 34, currentFruit, 0.8);
    }

    objects.forEach((obj) => {
      drawFruit(obj.x, obj.y, obj.level);
    });

    if (paused) {
      ctx.fillStyle = "rgba(7,9,20,.62)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 28px system-ui";
      ctx.fillText("PAUSED", W / 2, H / 2);
    }
  }

  function startGame() {
    objects = [];
    score = 0;
    currentFruit = randomFruit();
    nextFruit = randomFruit();
    aimX = W / 2;
    canDrop = true;
    gameOver = false;
    paused = false;
    gameStarted = true;
    activePower = "";

    powerCounts = { swap: 3, bomb: 2, grow: 2, mix: 2 };

    $("modalLayer")?.classList.add("hidden");
    $("settingsPanel")?.classList.add("hidden");
    $("overPanel")?.classList.add("hidden");

    updateText();
    draw();

    if (animationFrame) cancelAnimationFrame(animationFrame);
    lastTime = performance.now();
    animationFrame = requestAnimationFrame(loop);
  }

  function openHome() {
    paused = true;
    draw();

    const layer = $("modalLayer");
    const home = $("homePanel");

    if (layer) layer.classList.remove("hidden");
    if (home) home.classList.remove("hidden");

    $("settingsPanel")?.classList.add("hidden");
    $("overPanel")?.classList.add("hidden");
  }

  function dropFruit() {
    if (!gameStarted || gameOver || paused || !canDrop) return;

    const r = fruitRadius(currentFruit);
    const x = clamp(aimX, WALL + r, W - WALL - r);

    if (
      objects.some(
        (obj) =>
          Math.hypot(obj.x - x, obj.y - 36) < obj.r + r + 2
      )
    ) {
      showToast("Thoda khaali jagah par drop karein!");
      return;
    }

    objects.push({
      x,
      y: 35,
      vx: 0,
      vy: 0,
      level: currentFruit,
      resting: false,
      age: 0
    });

    playSound(300 + currentFruit * 45, 0.055);
    currentFruit = nextFruit;
    nextFruit = randomFruit();

    canDrop = false;
    updateText();
    draw();

    setTimeout(() => {
      canDrop = true;
      draw();
    }, 300);
  }

  function mergePair(a, b) {
    if (
      a.level !== b.level ||
      a.level >= fruits.length - 1 ||
      a.merging ||
      b.merging
    ) {
      return false;
    }

    const newLevel = a.level + 1;
    const totalMass = a.r * a.r + b.r * b.r;

    const nx = (a.x * a.r * a.r + b.x * b.r * b.r) / totalMass;
    const ny = (a.y * a.r * a.r + b.y * b.r * b.r) / totalMass;

    a.merging = true;
    b.merging = true;

    const removeSet = new Set([a, b]);
    objects = objects.filter((obj) => !removeSet.has(obj));

    const newR = fruitRadius(newLevel);

    objects.push({
      x: clamp(nx, WALL + newR, W - WALL - newR),
      y: clamp(ny, newR + 2, FLOOR - newR),
      vx: 0,
      vy: -90,
      level: newLevel,
      resting: false,
      age: 0
    });

    score += fruits[newLevel].points;
    if (score > best) {
      best = score;
      saveBest();
    }

    playSound(520 + newLevel * 65, 0.12, "triangle");
    updateText();
    return true;
  }

  function physics(dt) {
    const substeps = 2;
    const step = dt / substeps;

    for (let s = 0; s < substeps; s++) {
      for (const obj of objects) {
        obj.age += step;
        obj.vy += GRAVITY * step;
        obj.vy = Math.min(obj.vy, 1100);

        obj.x += obj.vx * step;
        obj.y += obj.vy * step;

        obj.vx *= Math.pow(0.995, step * 60);

        if (obj.x - obj.r < WALL) {
          obj.x = WALL + obj.r;
          obj.vx = Math.abs(obj.vx) * 0.25;
        }

        if (obj.x + obj.r > W - WALL) {
          obj.x = W - WALL - obj.r;
          obj.vx = -Math.abs(obj.vx) * 0.25;
        }

        if (obj.y + obj.r > FLOOR) {
          obj.y = FLOOR - obj.r;

          if (obj.vy > 40) {
            obj.vy = -obj.vy * RESTITUTION;
          } else {
            obj.vy = 0;
          }

          obj.vx *= 0.92;
        }
      }

      for (let i = 0; i < objects.length; i++) {
        const a = objects[i];

        for (let j = i + 1; j < objects.length; j++) {
          const b = objects[j];

          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.hypot(dx, dy);
          const minimum = a.r + b.r;

          if (distance >= minimum) continue;

          if (distance < 0.001) {
            dx = randomBetween(-1, 1);
            dy = randomBetween(-1, 1);
            distance = Math.hypot(dx, dy) || 1;
          }

          if (a.level === b.level && !a.merging && !b.merging) {
            if (mergePair(a, b)) {
              return;
            }
          }

          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = minimum - distance;

          const correction = overlap * 0.51;

          a.x -= nx * correction;
          a.y -= ny * correction;
          b.x += nx * correction;
          b.y += ny * correction;

          const relativeX = b.vx - a.vx;
          const relativeY = b.vy - a.vy;
          const velocityAlongNormal = relativeX * nx + relativeY * ny;

          if (velocityAlongNormal < 0) {
            const impulse = -(1 + RESTITUTION) * velocityAlongNormal / 2;

            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
          }
        }
      }
    }

    objects = objects.filter((obj) => {
      return Number.isFinite(obj.x) && Number.isFinite(obj.y);
    });

    checkGameOver(dt);
  }

  function checkGameOver(dt) {
    let danger = false;

    for (const obj of objects) {
      if (
        obj.y - obj.r < DANGER_LINE &&
        obj.age > 1.2 &&
        Math.abs(obj.vy) < 75
      ) {
        danger = true;
        break;
      }
    }

    if (danger) {
      checkGameOver.timer = (checkGameOver.timer || 0) + dt;
    } else {
      checkGameOver.timer = 0;
    }

    if (checkGameOver.timer > 1.8) {
      checkGameOver.timer = 0;
      endGame();
    }
  }

  function endGame() {
    gameOver = true;
    canDrop = false;
    draw();

    if ($("finalScore")) {
      $("finalScore").textContent = score.toLocaleString();
    }

    $("modalLayer")?.classList.remove("hidden");
    $("homePanel")?.classList.add("hidden");
    $("settingsPanel")?.classList.add("hidden");
    $("overPanel")?.classList.remove("hidden");

    playSound(180, 0.3, "sawtooth");
  }

  function loop(time) {
    if (!gameStarted || gameOver) {
      draw();
      return;
    }

    if (paused) {
      draw();
      animationFrame = requestAnimationFrame(loop);
      return;
    }

    const dt = Math.min((time - lastTime) / 1000 || 0, MAX_DT);
    lastTime = time;

    accumulator += dt;

    while (accumulator >= 1 / 60) {
      physics(1 / 60);
      accumulator -= 1 / 60;
    }

    draw();
    animationFrame = requestAnimationFrame(loop);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;

    return clamp(
      (event.clientX - rect.left) * scaleX,
      WALL + fruitRadius(currentFruit),
      W - WALL - fruitRadius(currentFruit)
    );
  }

  function onPointerMove(event) {
    if (!gameStarted || gameOver || paused || !canDrop) return;

    aimX = pointerPosition(event);
    draw();
  }

  function onPointerDown(event) {
    if (!gameStarted || gameOver || paused) return;

    event.preventDefault();
    aimX = pointerPosition(event);
    dropFruit();
  }

  function usePower(name) {
    if (!gameStarted || gameOver || paused) return;

    if (!powerCounts[name]) {
      showToast("Is power-up ke charges khatam hain!");
      return;
    }

    if (name === "swap") {
      currentFruit = randomFruit();
      nextFruit = randomFruit();
      powerCounts.swap--;
      showToast("Fruit swap ho gaya!");
      playSound(600, 0.1, "triangle");
    }

    if (name === "bomb") {
      if (!objects.length) {
        showToast("Abhi koi fruit nahi hai!");
        return;
      }

      const largest = objects.reduce((bestObj, obj) =>
        obj.level > bestObj.level ? obj : bestObj
      );

      objects = objects.filter((obj) => obj !== largest);
      score += Math.max(1, fruits[largest.level].points);
      powerCounts.bomb--;

      if (score > best) {
        best = score;
        saveBest();
      }

      showToast("Fruit blast! 💥");
      playSound(210, 0.2, "sawtooth");
    }

    if (name === "grow") {
      const fruit = fruits[currentFruit];

      if (currentFruit < fruits.length - 1) {
        currentFruit++;
      } else {
        currentFruit = 0;
      }

      powerCounts.grow--;
      showToast("Next fruit upgrade!");
      playSound(500, 0.1, "triangle");
    }

    if (name === "mix") {
      objects.forEach((obj) => {
        obj.vx += randomBetween(-170, 170);
        obj.vy -= randomBetween(30, 120);
      });

      powerCounts.mix--;
      showToast("Fruits mix ho gaye!");
      playSound(380, 0.15, "triangle");
    }

    updateText();
    draw();
  }

  function openSettings() {
    paused = true;

    $("modalLayer")?.classList.remove("hidden");
    $("homePanel")?.classList.add("hidden");
    $("overPanel")?.classList.add("hidden");
    $("settingsPanel")?.classList.remove("hidden");

    draw();
  }

  function closeSettings() {
    $("settingsPanel")?.classList.add("hidden");
    $("modalLayer")?.classList.add("hidden");

    if (gameStarted && !gameOver) {
      paused = false;
      lastTime = performance.now();
    }

    draw();
  }

  function restartGame() {
    startGame();
    showToast("New game started!");
  }

  function bind(id, event, callback) {
    const element = $(id);
    if (element) element.addEventListener(event, callback);
  }

  bind("playNow", "click", startGame);
  bind("restartBtn", "click", restartGame);
  bind("resumeBtn", "click", closeSettings);
  bind("settingsBtn", "click", openSettings);
  bind("homeBtn", "click", openHome);
  bind("overHomeBtn", "click", openHome);
  bind("closeModal", "click", closeSettings);
  bind("applySettings", "click", closeSettings);

  bind("bSwap", "click", () => usePower("swap"));
  bind("bBomb", "click", () => usePower("bomb"));
  bind("bGrow", "click", () => usePower("grow"));
  bind("bMix", "click", () => usePower("mix"));

  bind("soundToggle", "change", (event) => {
    soundOn = Boolean(event.target.checked);

    try {
      localStorage.setItem(STORAGE.sound, soundOn ? "on" : "off");
    } catch (_) {}

    showToast(soundOn ? "Sound on 🔊" : "Sound off 🔇");
  });

  if ($("soundToggle")) {
    $("soundToggle").checked = soundOn;
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);

  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      aimX = clamp(aimX - 15, WALL + fruitRadius(currentFruit), W - WALL);
      draw();
    } else if (event.key === "ArrowRight") {
      aimX = clamp(aimX + 15, WALL, W - WALL - fruitRadius(currentFruit));
      draw();
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      dropFruit();
    }
  });

  window.addEventListener("resize", resizeCanvas);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameStarted && !gameOver) {
      paused = true;
      draw();
    }
  });

  resizeCanvas();
  updateText();

  $("modalLayer")?.classList.remove("hidden");
  $("homePanel")?.classList.remove("hidden");
  $("settingsPanel")?.classList.add("hidden");
  $("overPanel")?.classList.add("hidden");

  draw();
})();
