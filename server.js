// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const boardW = 128;
const boardH = 128;

// === Игровое поле (двумерный массив цветов) ===
let board = Array.from({ length: boardH }, () => Array(boardW).fill("#FFFFFF"));

// === История чата ===
let chat = [];

// === WebSocket подключение ===
wss.on("connection", (ws) => {
    console.log("✅ Новый игрок подключился");

    // Отправляем текущее поле и чат
    ws.send(JSON.stringify({
        type: "init",
        board,
        chat
    }));

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "setPixel") {
                const { x, y, color, player } = data;
                if (x >= 0 && y >= 0 && x < boardW && y < boardH) {
                    board[y][x] = color;
                    // Шлём всем игрокам
                    broadcast({
                        type: "pixel",
                        x, y, color, player
                    });
                }
            }

            if (data.type === "chat") {
                const msg = {
                    player: data.player || "Гость",
                    text: data.text
                };
                chat.push(msg);
                if (chat.length > 100) chat.shift(); // ограничим историю
                broadcast({
                    type: "chat",
                    player: msg.player,
                    text: msg.text
                });
            }
        } catch (e) {
            console.error("Ошибка обработки сообщения:", e);
        }
    });

    ws.on("close", () => {
        console.log("❌ Игрок отключился");
    });
});

function broadcast(msg) {
    const str = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(str);
        }
    });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌍 Сервер запущен на порту ${PORT}`);
});
