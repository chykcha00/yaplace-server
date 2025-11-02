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

// === Камера и зум ===
let scale = 4;
let offsetX = 0;
let offsetY = 0;

let targetScale = scale;
let targetOffsetX = offsetX;
let targetOffsetY = offsetY;

let isPanning = false;
let panStart = { x: 0, y: 0 };
let viewStart = { x: 0, y: 0 };
let lastPinchDist = null;

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

paletteDiv.addEventListener("wheel", (e) => {
    e.preventDefault();
    paletteDiv.scrollBy({ left: e.deltaY > 0 ? 180 : -180, behavior: "smooth" });
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

// === Главный цикл камеры (плавный зум и пан) ===
function updateCamera() {
    scale += (targetScale - scale) * 0.2;
    offsetX += (targetOffsetX - offsetX) * 0.2;
    offsetY += (targetOffsetY - offsetY) * 0.2;
    draw();
    requestAnimationFrame(updateCamera);
}
updateCamera();

// === Панорамирование мышью ===
canvas.addEventListener('mousedown', e => {
    if (e.button === 2) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        viewStart = { x: targetOffsetX, y: targetOffsetY };
    }
});

canvas.addEventListener('mousemove', e => {
    if (isPanning) {
        targetOffsetX = viewStart.x + (e.clientX - panStart.x);
        targetOffsetY = viewStart.y + (e.clientY - panStart.y);
    }
});

canvas.addEventListener('mouseup', () => isPanning = false);
canvas.addEventListener('mouseleave', () => isPanning = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());

// === Зум колесом ===
canvas.addEventListener("wheel", e => {
    e.preventDefault();
    if (isPanning) return;
    const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cx = (e.clientX - rect.left) * dpr;
    const cy = (e.clientY - rect.top) * dpr;
    const worldX = (cx - targetOffsetX) / targetScale;
    const worldY = (cy - targetOffsetY) / targetScale;
    targetScale = Math.min(Math.max(targetScale * zoomFactor, 1), 64);
    targetOffsetX = cx - worldX * targetScale;
    targetOffsetY = cy - worldY * targetScale;
}, { passive: false });

// === Сенсорные устройства (тач) ===
canvas.addEventListener("touchstart", e => {
    if (e.touches.length === 1) {
        isPanning = true;
        panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        viewStart = { x: targetOffsetX, y: targetOffsetY };
        lastPinchDist = null;
    } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    }
});

canvas.addEventListener("touchmove", e => {
    e.preventDefault();
    if (e.touches.length === 1 && isPanning) {
        targetOffsetX = viewStart.x + (e.touches[0].clientX - panStart.x);
        targetOffsetY = viewStart.y + (e.touches[0].clientY - panStart.y);
    } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (lastPinchDist) {
            const zoomFactor = dist / lastPinchDist;
            const rect = canvas.getBoundingClientRect();
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
            const worldX = (cx - targetOffsetX) / targetScale;
            const worldY = (cy - targetOffsetY) / targetScale;
            targetScale = Math.min(Math.max(targetScale * zoomFactor, 1), 64);
            targetOffsetX = cx - worldX * targetScale;
            targetOffsetY = cy - worldY * targetScale;
        }
        lastPinchDist = dist;
    }
}, { passive: false });

canvas.addEventListener("touchend", () => {
    isPanning = false;
    lastPinchDist = null;
});
// === WebSocket ===
const socket = new WebSocket("wss://yaplace-server.onrender.com");

// === Обработка сообщений ===
socket.addEventListener("message", event => {
    const data = JSON.parse(event.data);

    if (data.type === "nameRejected") {
        alert(data.reason);
        localStorage.removeItem("playerName");
        mainMenu.style.display = "flex";
        playerNameInput.style.display = "block";
        playerNameInput.value = "";
        return;
    }

    if (data.type === "nameAccepted") {
        console.log("✅ Имя принято:", data.player);
        mainMenu.style.display = "none";
        draw();
        return;
    }

    if (data.type === "init") {
        for (let y = 0; y < boardH; y++) {
            for (let x = 0; x < boardW; x++) {
                offCtx.fillStyle = data.board[y][x];
                offCtx.fillRect(x, y, 1, 1);
            }
        }
        draw();
        return;
    }

    if (data.type === "pixel") {
        offCtx.fillStyle = data.color;
        offCtx.fillRect(data.x, data.y, 1, 1);
        draw();
        return;
    }

    if (data.type === "chat") {
        const p = document.createElement("p");
        p.innerHTML = `<b>${data.player}:</b> ${data.text}`;
        const chatBox = document.getElementById("chat-global");
        chatBox.appendChild(p);
        chatBox.scrollTop = chatBox.scrollHeight;
        return;
    }
});

socket.addEventListener("open", () => {
    console.log("✅ Соединение установлено");
});

socket.addEventListener("error", () => {
    alert("⚠️ Ошибка подключения к серверу");
});

// === Клик по канвасу ===
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

// === Сброс камеры ===
const resetBtn = document.getElementById('reset-view');
resetBtn.addEventListener('click', () => {
    scale = 4;
    const rect = canvas.getBoundingClientRect();
    offsetX = (rect.width / 2) - (boardW * scale / 2);
    offsetY = (rect.height / 2) - (boardH * scale / 2);
    targetScale = scale;
    targetOffsetX = offsetX;
    targetOffsetY = offsetY;
    draw();
});

// === Старт игры ===
startButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
        alert("Введите имя перед началом игры!");
        return;
    }

    playerName = name;
    localStorage.setItem("playerName", playerName);

    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "setName",
            player: playerName
        }));
    } else {
        alert("Соединение с сервером ещё не установлено. Попробуйте через пару секунд.");
    }
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
