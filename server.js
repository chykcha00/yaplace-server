const fs = require("fs");
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

// Папка для хранения данных
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const BOARD_FILE = path.join(DATA_DIR, "board.json");
const CHAT_FILE = path.join(DATA_DIR, "chat.json");

// === Canvas ===
const width = 128;
const height = 128;

// Загружаем доску
let board;
try {
    board = JSON.parse(fs.readFileSync(BOARD_FILE));
} catch {
    board = Array.from({ length: height }, () =>
        Array.from({ length: width }, () => "#FFFFFF")
    );
}

// Загружаем историю чата
let chatHistory;
try {
    chatHistory = JSON.parse(fs.readFileSync(CHAT_FILE));
} catch {
    chatHistory = [];
}

// Список игроков
let players = [];

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    console.log("🟢 Игрок подключился");

    const player = {
        ws,
        name: "Гость",
        team: ["red", "blue"][Math.floor(Math.random() * 2)]
    };
    players.push(player);

    ws.send(JSON.stringify({
        type: "init",
        board,
        team: player.team,
        chat: chatHistory
    }));

    ws.on("message", msg => {
        try {
            const data = JSON.parse(msg);

            // === Пиксели ===
            if (data.type === "setPixel") {
                const { x, y, color, player: playerName } = data;
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    board[y][x] = color;

                    // Сохраняем доску на диск
                    fs.writeFileSync(BOARD_FILE, JSON.stringify(board));

                    const update = JSON.stringify({
                        type: "pixel",
                        x,
                        y,
                        color,
                        player: playerName
                    });

                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) client.send(update);
                    });
                }
            }

            // === Установка имени ===
            else if (data.type === "setName") {
                player.name = data.player;
            }

            // === Чат ===
            else if (data.type === "chat") {
                const chatMsg = {
                    type: "chat",
                    player: player.name,
                    text: String(data.text ?? "").slice(0, 500),
                    channel: data.channel,
                    team: player.team
                };

                chatHistory.push(chatMsg);
                if (chatHistory.length > 100) chatHistory.shift();

                // Сохраняем чат на диск
                fs.writeFileSync(CHAT_FILE, JSON.stringify(chatHistory));

                const chatStr = JSON.stringify(chatMsg);

                if (data.channel === "global") {
                    players.forEach(p => {
                        if (p.ws.readyState === WebSocket.OPEN) p.ws.send(chatStr);
                    });
                } else if (data.channel === "team") {
                    players.forEach(p => {
                        if (p.team === player.team && p.ws.readyState === WebSocket.OPEN) p.ws.send(chatStr);
                    });
                }
            }

        } catch (e) {
            console.error("Ошибка парсинга:", e);
        }
    });

    ws.on("close", () => {
        console.log("🔴 Игрок отключился");
        players = players.filter(p => p.ws !== ws);
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`✅ Сервер запущен. Порт: ${PORT}`);
});
