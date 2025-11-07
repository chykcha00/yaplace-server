const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { MongoClient } = require("mongodb");

// === Настройки ===
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const boardW = 128;
const boardH = 128;

// === Подключение к MongoDB ===
const uri = process.env.MONGODB_URI; // в Render добавить переменную окружения
const client = new MongoClient(uri);
let db, boards, chats;

// === Галерея недели ===
let galleryOfWeek = [];



// === Инициализация базы ===
async function initDB() {
    try {
        await client.connect();
        db = client.db("yaplace");
        boards = db.collection("board");
        chats = db.collection("chat");
        console.log("✅ Подключено к MongoDB");

        const existing = await boards.findOne({ _id: "main" });
        if (!existing) {
            const blank = Array.from({ length: boardH }, () => Array(boardW).fill("#FFFFFF"));
            await boards.insertOne({ _id: "main", data: blank });
            console.log("🎨 Создано новое поле");
        }

        const chatCount = await chats.countDocuments();
        if (chatCount === 0) console.log("💬 Чат пуст");
    } catch (err) {
        console.error("❌ Ошибка подключения к MongoDB:", err);
    }
}
initDB();

// === Игровое поле и чат ===
let board = Array.from({ length: boardH }, () => Array(boardW).fill("#FFFFFF"));
let chat = [];

// === Загрузка сохранений из базы ===
async function loadBoard() {
    const doc = await boards.findOne({ _id: "main" });
    if (doc?.data) {
        board = doc.data;
        console.log("🎨 Поле загружено из MongoDB");
    }
}

async function saveBoard() {
    await boards.updateOne({ _id: "main" }, { $set: { data: board } });
}

async function loadChat() {
    chat = await chats.find().sort({ _id: -1 }).limit(100).toArray();
    chat.reverse();
    console.log("💬 Чат загружен из MongoDB");
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

// 🔄 Эндпоинт для обновления галереи недели
app.post("/update-gallery", (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) {
        return res.status(400).json({ error: "items должен быть массивом" });
    }

    // Обновляем глобальную переменную
    galleryOfWeek = items;
    console.log("✅ Галерея недели обновлена через API");

    // Рассылаем обновление всем подключённым клиентам
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: "galleryOfWeek",
                items: galleryOfWeek
            }));
        }
    });

    res.json({ success: true });
});


// === WebSocket ===
wss.on("connection", async (ws) => {
    console.log("✅ Новый игрок подключился");

    await loadBoard();
    await loadChat();

    ws.send(JSON.stringify({ type: "init", board, chat }));
    // Отправляем текущие рисунки недели
    ws.send(JSON.stringify({
        type: "galleryOfWeek",
        items: galleryOfWeek
    }));


    ws.on("message", async (message) => {
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
                    await saveBoard();
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
                await saveChat(msg);
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
