const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

// Раздаём папку public/
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Настройки доски
const WIDTH = 128;
const HEIGHT = 128;

let board = Array.from({ length: HEIGHT }, () =>
    Array.from({ length: WIDTH }, () => "#FFFFFF")
);

let players = [];
let chatHistory = []; // max 100

// Ограничение пикселей за сессию (опционально)
const MAX_PIXEL_PER_SECOND = 10;
const pixelTimestamps = new Map();

wss.on("connection", (ws) => {
    console.log("🟢 Игрок подключился");

    const player = {
        ws,
        name: "Гость",
        team: ["red", "blue"][Math.floor(Math.random() * 2)]
    };
    players.push(player);

    // Отправка инициализации
    ws.send(JSON.stringify({
        type: "init",
        board,
        team: player.team,
        chat: chatHistory
    }));

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);

            if (data.type === "setPixel") {
                const { x, y, color } = data;

                // Ограничение спама пикселями
                const now = Date.now();
                const timestamps = pixelTimestamps.get(ws) || [];
                const recent = timestamps.filter(t => now - t < 1000);
                if (recent.length >= MAX_PIXEL_PER_SECOND) return;
                recent.push(now);
                pixelTimestamps.set(ws, recent);

                if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
                    board[y][x] = color;

                    const update = JSON.stringify({
                        type: "pixel",
                        x,
                        y,
                        color,
                        player: player.name,
                    });

                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) client.send(update);
                    });
                }
            }
            else if (data.type === "setName") {
                player.name = data.player || "Гость";
            }
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

                const chatStr = JSON.stringify(chatMsg);

                if (data.channel === "global") {
                    players.forEach(p => {
                        if (p.ws.readyState === WebSocket.OPEN) p.ws.send(chatStr);
                    });
                } else if (data.channel === "team") {
                    players.forEach(p => {
                        if (p.team === player.team && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(chatStr);
                        }
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
        pixelTimestamps.delete(ws);
    });
});

// Динамический порт для хостов типа Railway
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});
