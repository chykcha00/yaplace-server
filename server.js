// server.js
const path = require("path");
const fs = require("fs").promises;
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();

const DATA_FILE = path.join(__dirname, "data.json");
const TEMP_FILE = path.join(__dirname, "data.json.tmp");

const WIDTH = 128;
const HEIGHT = 128;

let board;
let chatHistory;
let dirty = false; // флаг — есть ли несохранённые изменения

async function loadData() {
    try {
        const raw = await fs.readFile(DATA_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.board) && Array.isArray(parsed.chatHistory)) {
            board = parsed.board;
            chatHistory = parsed.chatHistory;
            console.log("✅ Данные загружены из data.json");
            return;
        }
        throw new Error("Неверный формат файла");
    } catch (err) {
        console.warn("⚠️ Не удалось загрузить data.json (создаю новые данные):", err.message);
        board = Array.from({ length: HEIGHT }, () =>
            Array.from({ length: WIDTH }, () => "#FFFFFF")
        );
        chatHistory = [];
        dirty = true; // нужно сохранить дефолтные данные
    }
}

async function saveDataAtomic() {
    if (!dirty) return;
    const payload = JSON.stringify({ board, chatHistory }, null, 2);
    try {
        await fs.writeFile(TEMP_FILE, payload, "utf-8");
        await fs.rename(TEMP_FILE, DATA_FILE); // атомарная замена
        dirty = false;
        console.log("💾 Данные успешно сохранены");
    } catch (err) {
        console.error("❌ Ошибка при сохранении data.json:", err);
    }
}

// автосохранение каждые 30 секунд (только если есть изменения)
setInterval(() => {
    saveDataAtomic().catch(err => console.error("Auto-save error:", err));
}, 30_000);

// init
loadData().catch(err => console.error("Load error:", err));

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Отладочный эндпоинт — посмотреть текущее состояние (удали при проде)
app.get("/debug/data", (_req, res) => {
    res.json({
        boardExists: !!board,
        chatCount: chatHistory.length,
        boardW: board ? board[0]?.length : 0,
        boardH: board ? board.length : 0
    });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = [];

wss.on("connection", (ws) => {
    console.log("🟢 Игрок подключился");

    const player = { ws, name: "Гость", team: ["red", "blue"][Math.floor(Math.random() * 2)] };
    players.push(player);

    // отправляем инициализацию
    try {
        ws.send(JSON.stringify({ type: "init", board, team: player.team, chat: chatHistory }));
    } catch (err) {
        console.error("Ошибка отправки init:", err);
    }

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);

            if (data.type === "setPixel") {
                const { x, y, color } = data;
                if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
                    board[y][x] = color;
                    dirty = true;
                    // моментально бродкастим
                    const upd = JSON.stringify({ type: "pixel", x, y, color, player: player.name });
                    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(upd); });
                }
            } else if (data.type === "setName") {
                player.name = data.player || player.name;
            } else if (data.type === "chat") {
                const chatMsg = { type: "chat", player: player.name, text: String(data.text ?? "").slice(0, 500), team: player.team };
                chatHistory.push(chatMsg);
                if (chatHistory.length > 100) chatHistory.shift();
                dirty = true;
                const chatStr = JSON.stringify(chatMsg);
                // рассылка по каналам (упрощённо: global)
                players.forEach(p => { if (p.ws.readyState === WebSocket.OPEN) p.ws.send(chatStr); });
            }
        } catch (e) {
            console.error("Ошибка парсинга/обработки сообщения:", e);
        }
    });

    ws.on("close", () => {
        console.log("🔴 Игрок отключился");
        players = players.filter(p => p.ws !== ws);
    });
});

// при корректном завершении процесса — пытаемся сохранить
process.on("SIGTERM", async () => {
    console.log("SIGTERM — сохраняю данные перед остановкой...");
    await saveDataAtomic();
    process.exit(0);
});
process.on("SIGINT", async () => {
    console.log("SIGINT — сохраняю данные перед остановкой...");
    await saveDataAtomic();
    process.exit(0);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`✅ Сервер запущен. Порт: ${PORT}`);
});
