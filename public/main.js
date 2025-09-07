// === Главное меню ===
const startButton = document.getElementById('start-game');
const mainMenu = document.getElementById('main-menu');
const playerNameInput = document.getElementById('player-name');

let playerName = "Гость";

// ✅ Проверяем localStorage
document.addEventListener("DOMContentLoaded", () => {
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
        // Если имя уже есть, используем его и скрываем поле
        playerName = savedName;
        playerNameInput.value = savedName;
        playerNameInput.style.display = "none"; // скрываем поле
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

// Заполняем белым
offCtx.fillStyle = "#ffffff";
offCtx.fillRect(0, 0, boardW, boardH);

// === Камера ===
let scale = 4;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let viewStart = { x: 0, y: 0 };

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

// создаём палитру
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

// Прокрутка палитры колесиком мыши (скорость увеличена)
paletteDiv.addEventListener("wheel", (e) => {
    e.preventDefault();
    paletteDiv.scrollBy({
        left: e.deltaY > 0 ? 180 : -180, // скорость прокрутки
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

// === Управление камерой (панорамирование) ===
canvas.addEventListener('mousedown', e => {
    if (e.button === 2) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        viewStart = { x: offsetX, y: offsetY };
    }
});
canvas.addEventListener('mousemove', e => {
    if (isPanning) {
        offsetX = viewStart.x + (e.clientX - panStart.x);
        offsetY = viewStart.y + (e.clientY - panStart.y);
        draw();
    }
});
canvas.addEventListener('mouseup', () => isPanning = false);
canvas.addEventListener('mouseleave', () => isPanning = false);
canvas.addEventListener('contextmenu', e => e.preventDefault());

// === Плавный зум ===
let targetScale = scale;
let targetOffsetX = offsetX;
let targetOffsetY = offsetY;
let zoomAnimating = false;

function animateZoom() {
    if (!zoomAnimating) return;

    scale += (targetScale - scale) * 0.2;
    offsetX += (targetOffsetX - offsetX) * 0.2;
    offsetY += (targetOffsetY - offsetY) * 0.2;

    draw();

    if (Math.abs(targetScale - scale) < 0.01 &&
        Math.abs(targetOffsetX - offsetX) < 0.5 &&
        Math.abs(targetOffsetY - offsetY) < 0.5) {
        scale = targetScale;
        offsetX = targetOffsetX;
        offsetY = targetOffsetY;
        zoomAnimating = false;
        draw();
        return;
    }

    requestAnimationFrame(animateZoom);
}

canvas.addEventListener("wheel", e => {
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
}, { passive: false });

// === WebSocket ===
const proto = location.protocol === "https:" ? "wss" : "ws";
const host = location.host || "localhost:8080";
const socket = new WebSocket(`${proto}://${host}`);

socket.addEventListener("open", () => {
    console.log("Соединение установлено");
});

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

        if (Array.isArray(data.chat)) {
            const chatBox = document.getElementById("chat-global");
            chatBox.innerHTML = "";
            data.chat.forEach(msg => {
                const p = document.createElement("p");
                p.innerHTML = `<b>${msg.player}:</b> ${msg.text}`;
                chatBox.appendChild(p);
            });
            chatBox.scrollTop = chatBox.scrollHeight;
        }
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

// === Кнопка сброса в правом нижнем углу ===
const resetBtn = document.getElementById('reset-view');
resetBtn.style.position = "fixed";
resetBtn.style.right = "10px";
resetBtn.style.bottom = "10px";
resetBtn.style.padding = "6px 10px";

resetBtn.addEventListener('click', () => {
    scale = 4;
    const rect = canvas.getBoundingClientRect();
    offsetX = (rect.width / 2) - (boardW * scale / 2);
    offsetY = (rect.height / 2) - (boardH * scale / 2);
    draw();
});

// === Старт игры с сохранением имени ===
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

// === Галерея ===
const openGalleryBtn = document.getElementById("open-gallery");
const galleryModal = document.getElementById("gallery-modal");
const closeGalleryBtn = document.getElementById("close-gallery");
const addSnapshotBtn = document.getElementById("add-snapshot");
const gallery = document.getElementById("gallery");

openGalleryBtn?.addEventListener("click", () => {
    galleryModal?.classList.remove("hidden");
    galleryModal?.setAttribute("aria-hidden", "false");
});
closeGalleryBtn?.addEventListener("click", () => {
    galleryModal?.classList.add("hidden");
    galleryModal?.setAttribute("aria-hidden", "true");
});
galleryModal?.addEventListener("click", (e) => {
    if (e.target === galleryModal) closeGalleryBtn?.click();
});
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !galleryModal?.classList.contains("hidden")) {
        closeGalleryBtn?.click();
    }
});
addSnapshotBtn?.addEventListener("click", () => {
    const img = new Image();
    img.src = canvas.toDataURL("image/png");
    img.alt = `snapshot-${Date.now()}`;
    gallery?.prepend(img);
});

// === Сбор пикселей ===
document.addEventListener("DOMContentLoaded", () => {
    const collectBtn = document.getElementById("collect-pixels");
    const collectTimer = document.getElementById("collect-timer");
    const pixelsEl = document.getElementById("pixels");

    let localPixelCount = parseInt(pixelsEl.textContent, 10);
    let nextCollectTime = 0;

    function updateCollectUI() {
        const now = Date.now();
        if (now >= nextCollectTime) {
            collectBtn.disabled = false;
            collectTimer.textContent = "";
        } else {
            collectBtn.disabled = true;
            const remaining = Math.ceil((nextCollectTime - now) / 1000);
            const min = Math.floor(remaining / 60);
            const sec = remaining % 60;
            collectTimer.textContent = `⏳ ${min}:${sec.toString().padStart(2, "0")}`;
        }
    }

    collectBtn.addEventListener("click", () => {
        const now = Date.now();
        if (now >= nextCollectTime) {
            pixelCount += 10;
            localPixelCount = pixelCount;
            pixelsEl.textContent = localPixelCount;

            nextCollectTime = now + 5 * 60 * 1000;
            updateCollectUI();
        }
    });

    setInterval(updateCollectUI, 1000);
    updateCollectUI();
});
