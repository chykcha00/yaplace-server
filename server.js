// server.js
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

const WIDTH = 128;
const HEIGHT = 128;

let board = [];
let chatHistory = [];
let players = [];

let db, boardCollection, chatCollection;

async function connectMongo() {
    try {
        const client = new MongoClient(process.env.MONGO_URI);
        await client.connect();
        db = client.db("yaplace");
        boardCollection = db.collection("board");
        chatCollection = db.collection("chat");

        // загружаем доску
        const boardDoc = await boardCollection.findOne({ _id: "main" });
        if (boardDoc) {
            board = boardDoc.pixels;
            console.log("✅ Доска загружена из MongoDB");
        } else {
            board = Array.from({ length: HEIGHT }, () =>
                Array.from({ length: WIDTH }, () => "#FFFFFF")
            );
            await boardCollection.insertOne({ _id: "main", pixels: board });
            console.log("🆕 Создана новая доска");
        }

        // загружаем чат
        chatHistory = await chatCollection.find().sort({ _id: 1 }).toArray();
        console.log(`💬 Загружено сообщений: ${chatHistory.length}`);
    } catch (err) {
        console.error("❌ Ошибка подключения к MongoDB:", err);
        process.exit(1);
    }
}

async function saveBoard() {
    await boardCollection.updateOne(
        { _id: "main" },
        { $set: { pixels: board } },
        { upsert: true }
    );
}

async function addChatMessage(msg) {
    const result = await chatCollection.insertOne(msg);
    msg._id = result.insertedId;
    chatHistory.push(msg);
    if (chatHistory.length > 100) {
        const removed = chatHistory.shift();
        await chatCollection.deleteOne({ _id: removed._id });
    }
}

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    console.log("🟢 Игрок подключился");

    const player = { ws, name: "Гость", team: ["red", "blue"][Math.floor(Math.random() * 2)] };
    players.push(player);

    ws.send(JSON.stringify({ type: "init", board, team: player.team, chat: chatHistory }));

    ws.on("message", async (msg) => {
        try {
            const data = JSON.parse(msg);

            if (data.type === "setPixel") {
                const { x, y, color } = data;
                if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
                    board[y][x] = color;
                    await saveBoard();
                    const upd = JSON.stringify({ type: "pixel", x, y, color, player: player.name });
                    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(upd); });
                }
            } else if (data.type === "setName") {
                player.name = data.player || player.name;
            } else if (data.type === "chat") {
                const chatMsg = { player: player.name, text: String(data.text ?? "").slice(0, 500), team: player.team };
                await addChatMessage(chatMsg);
                const chatStr = JSON.stringify({ type: "chat", ...chatMsg });
                players.forEach(p => { if (p.ws.readyState === WebSocket.OPEN) p.ws.send(chatStr); });
            }
        } catch (e) {
            console.error("Ошибка обработки сообщения:", e);
        }
    });

    ws.on("close", () => {
        console.log("🔴 Игрок отключился");
        players = players.filter(p => p.ws !== ws);
    });
});

const PORT = process.env.PORT || 8080;
connectMongo().then(() => {
    server.listen(PORT, () => console.log(`✅ Сервер запущен. Порт: ${PORT}`));
});
