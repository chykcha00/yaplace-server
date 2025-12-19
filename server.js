const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const { MongoClient } = require("mongodb");

// === Настройки ===
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const boardW = 128;
const boardH = 128;

// === Подключение к MongoDB ===
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let db, boards, chats;

// === Галерея недели (автоматическая загрузка) ===
const galleryDir = path.join(__dirname, "public", "gallery");
let galleryOfWeek = [];

function loadGallery() {
    if (!fs.existsSync(galleryDir)) {
        fs.mkdirSync(galleryDir, { recursive: true });
    }

    const BASE_URL = process.env.BASE_URL || "https://yaplace-server.onrender.com";

    const files = fs.readdirSync(galleryDir)
        .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
        .map(f => ({
            title: path.parse(f).name,
            image: `${BASE_URL}/gallery/${f}`
        }));

    galleryOfWeek = files;
}

loadGallery();
app.use("/gallery", express.static(galleryDir));
app.get("/api/gallery", (_req, res) => res.json(galleryOfWeek));

// === Инициализация базы ===
async function initDB() {
    try {
        await client.connect();
        db = client.db("yaplace");
        boards = db.collection("board");
        chats = db.collection("chat");

        const existing = await boards.findOne({ _id: "main" });
        if (!existing) {
            const blank = Array.from({ length: boardH }, () => Array(boardW).fill("#FFFFFF"));
            await boards.insertOne({ _id: "main", data: blank });
        }
    } catch (err) {
        console.error("❌ Ошибка подключения к MongoDB:", err);
    }
}
initDB();

// === Игровое поле и чат ===
let board = Array.from({ length: boardH }, () => Array(boardW).fill("#FFFFFF"));
let chat = [];

// === Загрузка и сохранение данных ===
async function loadBoard() {
    const doc = await boards.findOne({ _id: "main" });
    if (doc?.data) {
        board = doc.data;
    }
}

async function saveBoard() {
    await boards.updateOne({ _id: "main" }, { $set: { data: board } });
}

async function loadChat() {
    chat = await chats.find().sort({ _id: -1 }).limit(100).toArray();
    chat.reverse();
}

async function saveChat(msg) {
    await chats.insertOne(msg);
    const count = await chats.countDocuments();
    if (count > 200) {
        const extra = await chats.find().sort({ _id: 1 }).limit(count - 200).toArray();
        const ids = extra.map(c => c._id);
        await chats.deleteMany({ _id: { $in: ids } });
    }
}

// === Запрещённые слова и фильтрация ===
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

function filterMessage(text) {
    let filtered = text;
    for (const word of badWords) {
        const regex = new RegExp(word, "gi");
        filtered = filtered.replace(regex, (m) => "*".repeat(m.length));
    }
    return filtered;
}

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
wss.on("connection", async (ws) => {
    ws.connectTime = Date.now();
    ws.pixelsPlaced = 0;
    ws.adsWatched = 0; // placeholder — нет логики просмотра рекламы

    await loadBoard();
    await loadChat();

    ws.send(JSON.stringify({ type: "init", board, chat }));
    ws.send(JSON.stringify({ type: "galleryOfWeek", items: galleryOfWeek }));

    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "setName") {
                const name = (data.player || "").trim();
                if (!isNameAllowed(name)) {
                    ws.send(JSON.stringify({
                        type: "nameRejected",
                        reason: "Имя содержит запрещённые слова. Пожалуйста, выберите другое."
                    }));
                    return;
                }
                ws.playerName = name;
                ws.send(JSON.stringify({ type: "nameAccepted", player: name }));
                console.log(`Подключился игрок с именем ${name}`);
                return;
            }

            if (data.type === "setPixel") {
                const { x, y, color, player } = data;
                if (x >= 0 && y >= 0 && x < boardW && y < boardH) {
                    board[y][x] = color;
                    await saveBoard();
                    broadcast({ type: "pixel", x, y, color, player });
                    ws.pixelsPlaced += 1;
                }
                return;
            }

            if (data.type === "chat") {
                const playerName = ws.playerName || "Гость";
                const text = filterMessage(data.text);
                const msg = { player: playerName, text };
                chat.push(msg);
                if (chat.length > 100) chat.shift();
                await saveChat(msg);
                broadcast({ type: "chat", player: playerName, text });
                console.log(`Игрок ${playerName} написал в чат: ${text}`);
                return;
            }

        } catch (e) {
            // Не выводим ошибки в консоль по вашему запросу
        }
    });

    ws.on("close", () => {
        const duration = Math.floor((Date.now() - ws.connectTime) / 1000);
        const name = ws.playerName || "Неизвестный";
        console.log(`Игрок ${name} вышел из игры, он пробыл в игре ${duration} сек, он поставил ${ws.pixelsPlaced} пикселей, посмотрел ${ws.adsWatched} реклам`);
    });
});

function broadcast(msg) {
    const str = JSON.stringify(msg);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(str);
    });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    // Убрано сообщение о запуске сервера
});