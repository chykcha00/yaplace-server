const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const boardW = 128;
const boardH = 128;

// === Папка для сохранений ===
const SAVE_DIR = path.join(__dirname, "data");
const BOARD_FILE = path.join(SAVE_DIR, "board.json");
const CHAT_FILE = path.join(SAVE_DIR, "chat.json");

// === Функции для сохранения/загрузки ===
function ensureSaveDir() {
    if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR);
}

function saveBoard() {
    ensureSaveDir();
    fs.writeFileSync(BOARD_FILE, JSON.stringify(board));
}

function saveChat() {
    ensureSaveDir();
    fs.writeFileSync(CHAT_FILE, JSON.stringify(chat.slice(-100)));
}

function loadBoard() {
    try {
        if (fs.existsSync(BOARD_FILE)) {
            const data = JSON.parse(fs.readFileSync(BOARD_FILE, "utf8"));
            if (Array.isArray(data) && data.length === boardH) {
                board = data;
                console.log("🎨 Поле загружено из сохранения");
            }
        }
    } catch (err) {
        console.error("Ошибка загрузки board:", err);
    }
}

function loadChat() {
    try {
        if (fs.existsSync(CHAT_FILE)) {
            const data = JSON.parse(fs.readFileSync(CHAT_FILE, "utf8"));
            if (Array.isArray(data)) {
                chat = data.slice(-100);
                console.log("💬 Чат загружен из сохранения");
            }
        }
    } catch (err) {
        console.error("Ошибка загрузки chat:", err);
    }
}

// === Игровое поле и чат ===
let board = Array.from({ length: boardH }, () => Array(boardW).fill("#FFFFFF"));
let chat = [];

// === Загрузка сохранений ===
loadBoard();
loadChat();

// === Запрещённые слова ===
const badWords = [
    "хуй", "хуи", "хую", "хуем", "хуя", "хуёв", "хуев", "нахуя",
    "пизда", "пиздец", "пизд", "пизжу", "пиздишь", "пидр", "пидор", "пидар",
    "ебать", "ёбаный", "ебал", "ебло", "ебан", "ебуч", "еблан",
    "блядь", "бля", "блять", "блядина", "бляха",
    "сука", "суки", "сучка", "сучонок",
    "мразь", "мрази", "гондон", "гандон", "придурок", "идиот", "тупой", "дебил", "даун",
    "шлюха", "проститутка", "гнида",
    "fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit",
    "bitch", "bastard", "asshole", "dick", "cock", "pussy", "slut",
    "putin", "путин", "zelensky", "зеленский", "trump", "трамп", "biden", "байден", "navalny", "навальный"
];

// === Фильтрация текста ===
function filterMessage(text) {
    let filtered = text;
    for (const word of badWords) {
        const regex = new RegExp(word, "gi");
        filtered = filtered.replace(regex, (m) => "*".repeat(m.length));
    }
    return filtered;
}

// === Проверка имени ===
function isNameAllowed(name) {
    if (!name) return false;
    const lowered = name.toLowerCase();
    return !badWords.some(word => lowered.includes(word));
}

// === Раздача клиента ===
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) =>
    res.sendFile(path.join(__dirname, "public", "index.html"))
);

// === WebSocket ===
wss.on("connection", (ws) => {
    console.log("✅ Новый игрок подключился");

    // Отправляем начальные данные
    ws.send(JSON.stringify({ type: "init", board, chat }));

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            // === Установка имени ===
            if (data.type === "setName") {
                const name = (data.player || "").trim();
                if (!isNameAllowed(name)) {
                    ws.send(JSON.stringify({
                        type: "nameRejected",
                        reason: "Имя содержит запрещённые слова. Пожалуйста, выберите другое."
                    }));
                    console.log(`⛔ Отклонено имя: ${name}`);
                    return;
                }
                ws.playerName = name;
                ws.send(JSON.stringify({ type: "nameAccepted", player: name }));
                console.log(`✅ Игрок установил имя: ${name}`);
                return;
            }

            // === Рисование пикселя ===
            if (data.type === "setPixel") {
                const { x, y, color, player } = data;
                if (x >= 0 && y >= 0 && x < boardW && y < boardH) {
                    board[y][x] = color;
                    saveBoard();
                    broadcast({ type: "pixel", x, y, color, player });
                }
                return;
            }

            // === Сообщение в чат ===
            if (data.type === "chat") {
                const msg = {
                    player: data.player || "Гость",
                    text: filterMessage(data.text)
                };
                chat.push(msg);
                if (chat.length > 100) chat.shift();
                saveChat();
                broadcast({ type: "chat", player: msg.player, text: msg.text });
                return;
            }

        } catch (e) {
            console.error("Ошибка обработки сообщения:", e);
        }
    });

    ws.on("close", () => console.log("❌ Игрок отключился"));
});

// === Рассылка всем игрокам ===
function broadcast(msg) {
    const str = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(str);
    });
}

// === Запуск ===
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🌍 Сервер запущен на порту ${PORT}`));
