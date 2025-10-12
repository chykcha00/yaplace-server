const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const boardW = 128;
const boardH = 128;

// === Игровое поле (двумерный массив цветов) ===
let board = Array.from({ length: boardH }, () => Array(boardW).fill("#FFFFFF"));

// === История чата ===
let chat = [];

// === Запрещённые слова ===
const badWords = [
    // Русский мат
    "хуй", "хуи", "хую", "хуем", "хуя", "хуёв", "хуев", "нахуя",
    "пизда", "пиздец", "пизд", "пизжу", "пиздишь", "пидр", "пидор", "пидар",
    "ебать", "ёбаный", "ебал", "ебло", "ебан", "ебуч", "еблан",
    "блядь", "бля", "блять", "блядина", "бляха",
    "сука", "суки", "сучка", "сучонок",
    "мразь", "мрази", "гондон", "гандон", "придурок", "идиот", "тупой", "дебил", "даун",
    "шлюха", "проститутка", "гнида",

    // Английский мат
    "fuck", "fucking", "fucker", "motherfucker",
    "shit", "bullshit",
    "bitch", "bastard",
    "asshole", "dick", "cock", "pussy", "slut",

    // Политические и спорные имена
    "putin", "путин",
    "zelensky", "зеленский",
    "trump", "трамп",
    "biden", "байден",
    "navalny", "навальный"
];

// === Фильтрация сообщений чата ===
function filterMessage(text) {
    let filtered = text;
    for (const word of badWords) {
        const regex = new RegExp(word, "gi");
        filtered = filtered.replace(regex, (match) => "*".repeat(match.length));
    }
    return filtered;
}

// === Проверка допустимости имени ===
function isNameAllowed(name) {
    if (!name) return false;
    const lowered = name.toLowerCase();
    return !badWords.some(word => lowered.includes(word));
}

// === Отдача клиентской части ===
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// === WebSocket ===
wss.on("connection", (ws) => {
    console.log("✅ Новый игрок подключился");

    // Отправляем начальные данные
    ws.send(JSON.stringify({ type: "init", board, chat }));

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            // === Рисование пикселя ===
            if (data.type === "setPixel") {
                const { x, y, color, player } = data;
                if (x >= 0 && y >= 0 && x < boardW && y < boardH) {
                    board[y][x] = color;
                    broadcast({ type: "pixel", x, y, color, player });
                }
            }

            // === Сообщение в чат ===
            if (data.type === "chat") {
                const msg = {
                    player: data.player || "Гость",
                    text: filterMessage(data.text)
                };
                chat.push(msg);
                if (chat.length > 100) chat.shift();
                broadcast({ type: "chat", player: msg.player, text: msg.text });
            }

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
                console.log(`✅ Игрок установил имя: ${name}`);
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

// === Запуск сервера ===
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🌍 Сервер запущен на порту ${PORT}`));
