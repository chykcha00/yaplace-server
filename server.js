const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const boardW = 128;
const boardH = 128;

// Игровое поле (двумерный массив цветов)
let board = Array.from({ length: boardH }, () => Array(boardW).fill("#FFFFFF"));

// История чата
let chat = [];

// === Запрещённые слова ===
const badWords = [
    // Русский мат
    "хуй", "хуи", "хую", "хуем", "хуя", "хуёв", "хуев",
    "пизда", "пиздец", "пизд", "пизжу", "пиздишь",
    "ебать", "ёбаный", "ебал", "ебло", "ебан", "ебуч", "еблан",
    "блядь", "бля", "блять", "блядина", "бляха",
    "сука", "суки", "сучка", "сучонок",
    "мразь", "мрази", "гондон", "придурок", "идиот", "тупой", "дебил", "даун",
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

// === Фильтрация текста ===
function filterMessage(text) {
    let filtered = text;

    for (const word of badWords) {
        const regex = new RegExp(word, "gi"); // без учёта регистра
        filtered = filtered.replace(regex, (match) => "*".repeat(match.length));
    }

    return filtered;
}

// Статика (клиентская часть)
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// WebSocket
wss.on("connection", (ws) => {
    console.log("✅ Новый игрок подключился");

    // Отправляем текущую доску и чат
    ws.send(JSON.stringify({ type: "init", board, chat }));

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "setPixel") {
                const { x, y, color, player } = data;
                if (x >= 0 && y >= 0 && x < boardW && y < boardH) {
                    board[y][x] = color;
                    broadcast({ type: "pixel", x, y, color, player });
                }
            }

            if (data.type === "chat") {
                const msg = {
                    player: data.player || "Гость",
                    text: filterMessage(data.text) // ✅ фильтрация
                };
                chat.push(msg);
                if (chat.length > 100) chat.shift();
                broadcast({ type: "chat", player: msg.player, text: msg.text });
            }

            if (data.type === "setName") {
                console.log(`Игрок установил имя: ${data.player}`);
            }
        } catch (e) {
            console.error("Ошибка обработки сообщения:", e);
        }
    });

    ws.on("close", () => console.log("❌ Игрок отключился"));
});

function broadcast(msg) {
    const str = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(str);
    });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🌍 Сервер запущен на порту ${PORT}`));
