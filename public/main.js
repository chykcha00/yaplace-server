// === Главное меню ===
const startButton = document.getElementById('start-game');
const mainMenu = document.getElementById('main-menu');
const playerNameInput = document.getElementById('player-name');

let playerName = "Гость";

// ✅ Проверяем localStorage
document.addEventListener("DOMContentLoaded", () => {
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
        playerName = savedName;
        playerNameInput.value = savedName;
        playerNameInput.style.display = "none";
    }
});

// === Canvas и offscreen ===
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const off = document.createElement('canvas');
const offCtx = off.getContext('2d');
offCtx.imageSmoothingEnabled = false;

const boardW = 128;
const boardH = 128;
off.width = boardW;
off.height = boardH;

offCtx.fillStyle = "#ffffff";
offCtx.fillRect(0, 0, boardW, boardH);

// === Камера ===
let scale = 4;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let viewStart = { x: 0, y: 0 };

// Для тачей и инерции
let lastTouchDistance = null;
let lastTouchCenter = null;
let velocity = { x: 0, y: 0 };
let lastPanTime = 0;
let inertiaActive = false;

let targetScale = scale;
let targetOffsetX = offsetX;
let targetOffsetY = offsetY;
let zoomAnimating = false;

// === Палитра ===
const paletteDiv = document.getElementById('palette');
const paletteColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00',
    '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#FFA500', '#800080', '#008000', '#808000',
    '#800000', '#808080', '#FFC0CB', '#A52A2A',
    '#FFD700', '#00FA9A', '#4682B4', '#DC143C',
    '#00CED1', '#ADFF2F', '#FF69B4', '#4B0082'
];
let currentColor = paletteColors[0];
let activeDiv = null;

paletteDiv.innerHTML = "";
paletteColors.forEach(color => {
    const div = document.createElement('div');
    div.style.background = color;
    div.addEventListener('click', () => {
        currentColor = color;
        if (activeDiv) activeDiv.classList.remove('active');
        div.classList.add('active');
        activeDiv = div;
    });
    div.addEventListener('mouseenter', () => div.classList.add('hover'));
    div.addEventListener('mouseleave', () => div.classList.remove('hover'));
    paletteDiv.appendChild(div);
    if (color === currentColor) {
        div.classList.add('active');
        activeDiv = div;
    }
});

// === Прокрутка палитры ===
paletteDiv.addEventListener("wheel", (e) => {
    e.preventDefault();
    paletteDiv.scrollBy({
        left: e.deltaY > 0 ? 180 : -180,
        behavior: "smooth"
    });
});

// === Счётчик пикселей ===
const pixelCounter = document.getElementById('pixels');
let pixelCount = 30;
pixelCounter.textContent = pixelCount;

// === Отрисовка ===
function fitCanvasToScreen() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.drawImage(off, 0, 0, boardW, boardH);
    ctx.restore();
}

window.addEventListener('resize', fitCanvasToScreen);
fitCanvasToScreen();

// === Анимация зума ===
function animateZoom() {
    if (!zoomAnimating) return;
    scale += (targetScale - scale) * 0.2;
    offsetX += (targetOffsetX - offsetX) * 0.2;
    offsetY += (targetOffsetY - offsetY) * 0.2;
    draw();
    if (
        Math.abs(targetScale - scale) < 0.01 &&
        Math.abs(targetOffsetX - offsetX) < 0.5 &&
        Math.abs(targetOffsetY - offsetY) < 0.5
    ) {
        scale = targetScale;
        offsetX = targetOffsetX;
        offsetY = targetOffsetY;
        zoomAnimating = false;
        draw();
        return;
    }
    requestAnimationFrame(animateZoom);
}

// === Инерция ===
function animateInertia() {
    if (!inertiaActive) return;
    offsetX += velocity.x;
    offsetY += velocity.y;
    draw();
    velocity.x *= 0.95;
    velocity.y *= 0.95;
    if (Math.abs(velocity.x) < 0.1 && Math.abs(velocity.y) < 0.1) {
        inertiaActive = false;
        return;
    }
    requestAnimationFrame(animateInertia);
}

// === Управление мышью ===
canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) {
        isPanning = true;
        inertiaActive = false;
        panStart = { x: e.clientX, y: e.clientY };
        viewStart = { x: offsetX, y: offsetY };
        lastPanTime = performance.now();
    }
});

canvas.addEventListener("mousemove", (e) => {
    if (isPanning) {
        const now = performance.now();
        const dt = now - lastPanTime;
        offsetX = viewStart.x + (e.clientX - panStart.x);
        offsetY = viewStart.y + (e.clientY - panStart.y);
        velocity.x = (e.movementX) / dt * 16;
        velocity.y = (e.movementY) / dt * 16;
        draw();
        lastPanTime = now;
    }
});

canvas.addEventListener("mouseup", () => {
    if (isPanning) {
        isPanning = false;
        inertiaActive = true;
        requestAnimationFrame(animateInertia);
    }
});
canvas.addEventListener("mouseleave", () => (isPanning = false));
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// === Зум колесиком ===
canvas.addEventListener(
    "wheel",
    (e) => {
        e.preventDefault();
        if (isPanning) return;
        const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const cx = (e.clientX - rect.left) * dpr;
        const cy = (e.clientY - rect.top) * dpr;
        const worldX = (cx - offsetX) / scale;
        const worldY = (cy - offsetY) / scale;
        targetScale *= zoomFactor;
        targetOffsetX = cx - worldX * targetScale;
        targetOffsetY = cy - worldY * targetScale;
        if (!zoomAnimating) {
            zoomAnimating = true;
            requestAnimationFrame(animateZoom);
        }
    },
    { passive: false }
);

// === Сенсорные события (тач) ===
canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
        isPanning = true;
        inertiaActive = false;
        panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        viewStart = { x: offsetX, y: offsetY };
        lastPanTime = performance.now();
    } else if (e.touches.length === 2) {
        isPanning = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDistance = Math.hypot(dx, dy);
        lastTouchCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
    }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isPanning) {
        const now = performance.now();
        const dt = now - lastPanTime;
        const dx = e.touches[0].clientX - panStart.x;
        const dy = e.touches[0].clientY - panStart.y;
        offsetX = viewStart.x + dx;
        offsetY = viewStart.y + dy;
        velocity.x = (dx / dt) * 16;
        velocity.y = (dy / dt) * 16;
        draw();
        lastPanTime = now;
    } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.hypot(dx, dy);
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const center = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
        if (lastTouchDistance) {
            const zoomFactor = distance / lastTouchDistance;
            targetScale = scale * zoomFactor;
            const cx = (center.x - rect.left) * dpr;
            const cy = (center.y - rect.top) * dpr;
            const worldX = (cx - offsetX) / scale;
            const worldY = (cy - offsetY) / scale;
            targetOffsetX = cx - worldX * targetScale;
            targetOffsetY = cy - worldY * targetScale;
            zoomAnimating = true;
            requestAnimationFrame(animateZoom);
        }
        lastTouchDistance = distance;
        lastTouchCenter = center;
    }
}, { passive: false });

canvas.addEventListener("touchend", () => {
    if (isPanning) {
        isPanning = false;
        inertiaActive = true;
        requestAnimationFrame(animateInertia);
    }
    lastTouchDistance = null;
    lastTouchCenter = null;
});

// === WebSocket ===
const socket = new WebSocket("wss://yaplace-server.onrender.com");

// ✅ Обработка ошибок
socket.addEventListener("open", () => {
    console.log("✅ Соединение установлено");
});
socket.addEventListener("error", () => {
    alert("⚠️ Ошибка подключения к серверу. Попробуйте обновить страницу позже.");
});
socket.addEventListener("close", () => {
    const retry = confirm("🔌 Соединение потеряно. Переподключиться?");
    if (retry) location.reload();
});
socket.addEventListener("open", () => console.log("✅ WebSocket открыт с сервером"));

// === Обработка сообщений ===
socket.addEventListener("message", event => {
    const data = JSON.parse(event.data);
    if (data.type === "init") {
        for (let y = 0; y < boardH; y++) {
            for (let x = 0; x < boardW; x++) {
                offCtx.fillStyle = data.board[y][x];
                offCtx.fillRect(x, y, 1, 1);
            }
        }
        draw();
    }
    if (data.type === "pixel") {
        offCtx.fillStyle = data.color;
        offCtx.fillRect(data.x, data.y, 1, 1);
        draw();
    }
    if (data.type === "chat") {
        const p = document.createElement("p");
        p.innerHTML = `<b>${data.player}:</b> ${data.text}`;
        const chatBox = document.getElementById("chat-global");
        chatBox.appendChild(p);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});

// === Клик для пикселя ===
canvas.addEventListener('click', e => {
    if (e.button !== 0 || pixelCount <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = (e.clientX - rect.left) * dpr;
    const cy = (e.clientY - rect.top) * dpr;
    const x = Math.floor((cx - offsetX) / scale);
    const y = Math.floor((cy - offsetY) / scale);
    if (x >= 0 && y >= 0 && x < boardW && y < boardH) {
        socket.send(JSON.stringify({
            type: "setPixel",
            x,
            y,
            color: currentColor,
            player: playerName
        }));
        pixelCount--;
        pixelCounter.textContent = pixelCount;
    }
});

// === Кнопка сброса ===
const resetBtn = document.getElementById('reset-view');
resetBtn.addEventListener('click', () => {
    scale = 4;
    const rect = canvas.getBoundingClientRect();
    offsetX = (rect.width / 2) - (boardW * scale / 2);
    offsetY = (rect.height / 2) - (boardH * scale / 2);
    draw();
});

// === Старт игры ===
startButton.addEventListener('click', () => {
    if (!localStorage.getItem("playerName")) {
        const name = playerNameInput.value.trim();
        playerName = name !== "" ? name : "Гость";
        localStorage.setItem("playerName", playerName);
    }
    mainMenu.remove();
    draw();
    socket.send(JSON.stringify({
        type: "setName",
        player: playerName
    }));
});

// === Чат ===
const chatInput = document.getElementById("chat-input");
const sendChatBtn = document.getElementById("send-chat");

function sendChat() {
    const text = (chatInput?.value || "").trim();
    if (!text) return;
    socket.send(JSON.stringify({
        type: "chat",
        player: playerName,
        text,
        channel: "global"
    }));
    chatInput.value = "";
}

sendChatBtn?.addEventListener("click", sendChat);
chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
});
