(function () {
    let ysdk = window.ysdk || null;
    let userLang = window.userLang || "ru";

    function safeGet(id) { return document.getElementById(id); }

    let playerName = "Гость";

    function loadSavedName() {
        const savedName = localStorage.getItem("playerName");
        if (savedName) {
            playerName = savedName;
            const playerNameInput = safeGet('player-name');
            if (playerNameInput) {
                playerNameInput.value = savedName;
                playerNameInput.style.display = "none";
            }
        }
    }

    window.addEventListener("storage", (event) => {
        if (event.key === "playerPixels") {
            const newValue = parseInt(event.newValue) || 0;
            pixelCount = newValue;
            if (pixelCounter) pixelCounter.textContent = pixelCount;
            console.log("🔄 Синхронизировано количество пикселей:", newValue);
        }
    });

    function showToast(message) {
        const toast = safeGet('toast');
        const toastMessage = safeGet('toast-message');
        if (!toast || !toastMessage) return;
        toastMessage.textContent = message;
        toast.classList.remove('hidden', 'show');
        void toast.offsetHeight;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    document.addEventListener("DOMContentLoaded", async () => {
        // 🔥 БЛОКИРУЕМ БРАУЗЕРНЫЙ СКРОЛЛ НА МОБИЛЬНЫХ
        document.addEventListener('touchmove', (e) => {
            const chatBox = document.getElementById('chat-global');
            if (chatBox && chatBox.contains(e.target)) return;
            e.preventDefault();
        }, { passive: false });

        loadSavedName();

        // --- Отмена контекстного меню ---
        document.body.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        });

        const startButton = safeGet('start-game');
        const mainMenu = safeGet('main-menu');
        const playerNameInput = safeGet('player-name');
        const canvas = safeGet('board');
        const ctx = canvas ? canvas.getContext('2d') : null;
        const paletteDiv = safeGet('palette');
        const pixelCounter = safeGet('pixels');
        const adButton = safeGet('watch-ad');
        const openGalleryBtn = safeGet('open-gallery');
        const galleryModal = safeGet('gallery-modal');
        const closeGalleryBtn = safeGet('close-gallery');
        const chatInput = safeGet('chat-input');
        const sendChatBtn = safeGet('send-chat');
        const resetBtn = safeGet('reset-view');
        const collectBtn = safeGet('collect-pixels');
        const collectTimer = safeGet('collect-timer');
        const toast = safeGet('toast');
        const toastMessage = safeGet('toast-message');

        // Скрываем наш лоадер (опционально)
        const loadingOverlay = document.getElementById('yandex-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }

        if (canvas) {
            canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            });
        }

        if (!canvas || !ctx) console.error("canvas #board не найден или 2d context недоступен");

        const off = document.createElement('canvas');
        const offCtx = off.getContext('2d');
        const boardW = 128, boardH = 128;
        off.width = boardW; off.height = boardH;
        offCtx.fillStyle = "#ffffff"; offCtx.fillRect(0, 0, boardW, boardH);

        let scale = 4, offsetX = 0, offsetY = 0;
        let targetScale = scale, targetOffsetX = offsetX, targetOffsetY = offsetY;
        let isPanning = false, panStart = { x: 0, y: 0 }, viewStart = { x: 0, y: 0 }, lastPinchDist = null;

        // Переменная для хранения минимального масштаба
        let minScale = 1;

        // Функция для ограничения камеры, чтобы поле всегда было видно полностью
        function clampCamera() {
            const rect = canvas.getBoundingClientRect();
            const canvasWidth = rect.width;
            const canvasHeight = rect.height;

            // Размеры поля с учетом масштаба
            const scaledBoardWidth = boardW * targetScale;
            const scaledBoardHeight = boardH * targetScale;

            // Вычисляем минимальный масштаб, при котором поле полностью помещается
            minScale = Math.min(canvasWidth / boardW, canvasHeight / boardH);

            // Ограничиваем масштаб: минимальный - чтобы поле помещалось, максимальный - в 5 раз больше
            targetScale = Math.min(Math.max(targetScale, minScale), minScale * 20);

            // Пересчитываем размеры с учетом скорректированного масштаба
            const finalScaledBoardWidth = boardW * targetScale;
            const finalScaledBoardHeight = boardH * targetScale;

            // Если поле меньше или равно экрану, центрируем его
            if (finalScaledBoardWidth <= canvasWidth) {
                // Центрируем по горизонтали
                targetOffsetX = (canvasWidth - finalScaledBoardWidth) / 2;
            } else {
                // Если поле больше экрана, ограничиваем перемещение так, чтобы поле не выходило за границы
                // Левая граница: правое поле не должно уходить за левый край
                const maxOffsetX = 0;
                // Правая граница: левое поле не должно уходить за правый край
                const minOffsetX = canvasWidth - finalScaledBoardWidth;

                // Применяем ограничения
                targetOffsetX = Math.min(Math.max(targetOffsetX, minOffsetX), maxOffsetX);
            }

            if (finalScaledBoardHeight <= canvasHeight) {
                // Центрируем по вертикали
                targetOffsetY = (canvasHeight - finalScaledBoardHeight) / 2;
            } else {
                // Если поле больше экрана, ограничиваем перемещение по вертикали
                const maxOffsetY = 0;
                const minOffsetY = canvasHeight - finalScaledBoardHeight;

                targetOffsetY = Math.min(Math.max(targetOffsetY, minOffsetY), maxOffsetY);
            }
        }

        const paletteColors = [
            '#000000', '#FFFFFF', '#FF0000', '#00FF00',
            '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
            '#FFA500', '#800080', '#008000', '#808000',
            '#800000', '#808080', '#FFC0CB', '#A52A2A',
            '#FFD700', '#00FA9A', '#4682B4', '#DC143C',
            '#00CED1', '#ADFF2F', '#FF69B4', '#4B0082'
        ];
        let currentColor = paletteColors[0], activeDiv = null;
        if (paletteDiv) {
            paletteDiv.innerHTML = "";
            paletteColors.forEach(color => {
                const d = document.createElement('div');
                d.style.background = color;
                d.addEventListener('click', () => {
                    currentColor = color;
                    if (activeDiv) activeDiv.classList.remove('active');
                    d.classList.add('active');
                    activeDiv = d;
                });
                d.addEventListener('mouseenter', () => d.classList.add('hover'));
                d.addEventListener('mouseleave', () => d.classList.remove('hover'));
                paletteDiv.appendChild(d);
                if (color === currentColor) { d.classList.add('active'); activeDiv = d; }
            });
            paletteDiv.addEventListener("wheel", e => { e.preventDefault(); paletteDiv.scrollBy({ left: e.deltaY > 0 ? 180 : -180, behavior: "smooth" }); });
        }

        let pixelCount = parseInt(localStorage.getItem("playerPixels")) || 30;
        if (pixelCounter) pixelCounter.textContent = pixelCount;

        function updatePixels(amount) {
            pixelCount += amount;
            if (pixelCount < 0) pixelCount = 0;
            if (pixelCounter) pixelCounter.textContent = pixelCount;
            localStorage.setItem("playerPixels", pixelCount);
        }

        window.updatePixels = updatePixels;

        if (openGalleryBtn && galleryModal && closeGalleryBtn) {
            openGalleryBtn.addEventListener('click', () => {
                galleryModal.classList.remove('hidden');
            });
            closeGalleryBtn.addEventListener('click', () => {
                galleryModal.classList.add('hidden');
            });
        }

        function fitCanvasToScreen() {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.floor(canvas.clientWidth * dpr);
            canvas.height = Math.floor(canvas.clientHeight * dpr);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);

            const rect = canvas.getBoundingClientRect();
            // Вычисляем минимальный масштаб, при котором поле полностью помещается
            minScale = Math.min(rect.width / boardW, rect.height / boardH);
            // Устанавливаем масштаб так, чтобы поле занимало хорошую часть экрана
            scale = Math.max(4, minScale);
            offsetX = (rect.width / 2) - (boardW * scale / 2);
            offsetY = (rect.height / 2) - (boardH * scale / 2);
            targetScale = scale;
            targetOffsetX = offsetX;
            targetOffsetY = offsetY;

            draw();
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
            ctx.imageSmoothingEnabled = false;
            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.scale(scale, scale);
            ctx.drawImage(off, 0, 0, boardW, boardH);
            ctx.restore();
        }

        function resetView() {
            const rect = canvas.getBoundingClientRect();
            // Вычисляем минимальный масштаб для полного отображения поля
            minScale = Math.min(rect.width / boardW, rect.height / boardH);
            // Устанавливаем хороший масштаб для просмотра
            scale = Math.max(4, minScale);
            offsetX = (rect.width / 2) - (boardW * scale / 2);
            offsetY = (rect.height / 2) - (boardH * scale / 2);
            targetScale = scale;
            targetOffsetX = offsetX;
            targetOffsetY = offsetY;

            draw();
        }

        window.addEventListener('resize', () => {
            fitCanvasToScreen();
            clampCamera();
        });

        fitCanvasToScreen();

        function updateCamera() {
            scale += (targetScale - scale) * 0.2;
            offsetX += (targetOffsetX - offsetX) * 0.2;
            offsetY += (targetOffsetY - offsetY) * 0.2;

            draw();
            requestAnimationFrame(updateCamera);
        }
        updateCamera();

        if (canvas) {
            canvas.addEventListener('mousedown', e => {
                if (e.button === 2) {
                    isPanning = true;
                    panStart = { x: e.clientX, y: e.clientY };
                    viewStart = { x: targetOffsetX, y: targetOffsetY };
                }
            });
            canvas.addEventListener('mousemove', e => {
                if (isPanning) {
                    targetOffsetX = viewStart.x + (e.clientX - panStart.x);
                    targetOffsetY = viewStart.y + (e.clientY - panStart.y);
                    clampCamera();
                }
            });
            canvas.addEventListener('mouseup', () => isPanning = false);
            canvas.addEventListener('mouseleave', () => isPanning = false);

            canvas.addEventListener("wheel", e => {
                e.preventDefault();
                if (isPanning) return;
                const zoomFactor = e.deltaY < 0 ? 1.2 : 0.8;
                const rect = canvas.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                const worldX = (cx - targetOffsetX) / targetScale;
                const worldY = (cy - targetOffsetY) / targetScale;

                // Применяем зум
                targetScale *= zoomFactor;

                // Ограничиваем камеру (включая ограничение масштаба)
                clampCamera();

                // Пересчитываем смещение с учетом ограниченного масштаба
                targetOffsetX = cx - worldX * targetScale;
                targetOffsetY = cy - worldY * targetScale;

                // Снова ограничиваем камеру для корректировки смещения
                clampCamera();
            }, { passive: false });

            canvas.addEventListener("touchstart", e => {
                if (e.touches.length === 1) {
                    isPanning = true;
                    panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                    viewStart = { x: targetOffsetX, y: targetOffsetY };
                    lastPinchDist = null;
                } else if (e.touches.length === 2) {
                    const dx = e.touches[1].clientX - e.touches[0].clientX;
                    const dy = e.touches[1].clientY - e.touches[0].clientY;
                    lastPinchDist = Math.sqrt(dx * dx + dy * dy);
                }
            });
            canvas.addEventListener("touchmove", e => {
                e.preventDefault();
                if (e.touches.length === 1 && isPanning) {
                    targetOffsetX = viewStart.x + (e.touches[0].clientX - panStart.x);
                    targetOffsetY = viewStart.y + (e.touches[0].clientY - panStart.y);
                    clampCamera();
                } else if (e.touches.length === 2) {
                    const dx = e.touches[1].clientX - e.touches[0].clientX;
                    const dy = e.touches[1].clientY - e.touches[0].clientY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (lastPinchDist) {
                        const zoomFactor = dist / lastPinchDist;
                        const rect = canvas.getBoundingClientRect();
                        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                        const worldX = (cx - targetOffsetX) / targetScale;
                        const worldY = (cy - targetOffsetY) / targetScale;

                        // Применяем зум
                        targetScale *= zoomFactor;

                        // Ограничиваем камеру (включая ограничение масштаба)
                        clampCamera();

                        // Пересчитываем смещение с учетом ограниченного масштаба
                        targetOffsetX = cx - worldX * targetScale;
                        targetOffsetY = cy - worldY * targetScale;

                        // Снова ограничиваем камеру для корректировки смещения
                        clampCamera();
                    }
                    lastPinchDist = dist;
                }
            }, { passive: false });
            canvas.addEventListener("touchend", () => {
                isPanning = false;
                lastPinchDist = null;
            });
        }

        const socket = new WebSocket("wss://yaplace-server.onrender.com");

        socket.addEventListener("message", event => {
            const data = JSON.parse(event.data);

            if (data.type === "nameRejected") {
                showToast(data.reason);
                localStorage.removeItem("playerName");
                if (mainMenu) mainMenu.style.display = "flex";
                if (playerNameInput) playerNameInput.style.display = "block";
                if (playerNameInput) playerNameInput.value = "";
                return;
            }

            if (data.type === "nameAccepted") {
                console.log("✅ Имя принято:", data.player);
                if (mainMenu) mainMenu.style.display = "none";
                draw();
                return;
            }

            if (data.type === "init") {
                for (let y = 0; y < boardH; y++) {
                    for (let x = 0; x < boardW; x++) {
                        offCtx.fillStyle = data.board[y][x];
                        offCtx.fillRect(x, y, 1, 1);
                    }
                }
                draw();
                return;
            }

            if (data.type === "pixel") {
                offCtx.fillStyle = data.color;
                offCtx.fillRect(data.x, data.y, 1, 1);
                draw();
                return;
            }

            if (data.type === "chat") {
                const p = document.createElement("p");
                p.innerHTML = `<b>${data.player}:</b> ${data.text}`;
                const chatBox = document.getElementById("chat-global");
                if (chatBox) {
                    chatBox.appendChild(p);
                    chatBox.scrollTop = chatBox.scrollHeight;
                }
                return;
            }

            if (data.type === "galleryOfWeek") {
                const gallery = document.getElementById("gallery");
                if (!gallery) return;

                gallery.innerHTML = "";
                data.items.forEach(item => {
                    const div = document.createElement("div");
                    div.classList.add("gallery-item");

                    const img = document.createElement("img");
                    img.src = item.image;
                    img.alt = item.title;

                    const caption = document.createElement("p");
                    caption.textContent = item.title;

                    div.appendChild(img);
                    div.appendChild(caption);
                    gallery.appendChild(div);
                });
                console.log(`🖼 Получено ${data.items.length} рисунков недели`);
            }
        });

        socket.addEventListener("open", () => console.log("✅ Соединение установлено"));
        socket.addEventListener("error", () => {
            console.warn("WebSocket error");
            showToast("⚠️ Ошибка подключения к серверу");
        });

        if (canvas) {
            canvas.addEventListener('click', e => {
                if (e.button !== 0 || pixelCount <= 0) return;
                const rect = canvas.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                const x = Math.floor((cx - offsetX) / scale);
                const y = Math.floor((cy - offsetY) / scale);
                if (x >= 0 && y >= 0 && x < boardW && y < boardH) {
                    socket.send(JSON.stringify({
                        type: "setPixel",
                        x,
                        y,
                        color: currentColor,
                        player: playerName
                    }));
                    updatePixels(-1);
                }
            });
        }

        if (resetBtn && canvas) {
            resetBtn.addEventListener('click', resetView);
        }

        if (startButton && playerNameInput) {
            startButton.addEventListener('click', () => {
                const name = playerNameInput.value.trim();
                if (!name) {
                    showToast("Введите имя перед началом игры!");
                    return;
                }

                playerName = name;
                localStorage.setItem("playerName", playerName);

                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: "setName",
                        player: playerName
                    }));
                } else {
                    showToast("Сервер подготавливается, обычно это занимает не больше минуты");
                    if (mainMenu) {
                        const menuBox = mainMenu.querySelector('.menu-box');
                        if (menuBox && !document.getElementById('reload-server-btn')) {
                            const reloadButton = document.createElement('button');
                            reloadButton.textContent = 'Перезагрузить страницу';
                            reloadButton.id = 'reload-server-btn';
                            reloadButton.style.padding = '10px 20px';
                            reloadButton.style.fontSize = '16px';
                            reloadButton.style.cursor = 'pointer';
                            reloadButton.style.marginTop = '10px';
                            menuBox.appendChild(reloadButton);
                            reloadButton.addEventListener('click', () => location.reload());
                        }
                    }
                }
            });
        }

        if (sendChatBtn && chatInput) {
            function sendChat() {
                const text = (chatInput?.value || "").trim();
                if (!text) return;
                socket.send(JSON.stringify({
                    type: "chat",
                    player: playerName,
                    text,
                    channel: "global"
                }));
                chatInput.value = "";
            }
            sendChatBtn.addEventListener("click", sendChat);
            chatInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") sendChat();
            });
        }

        setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "ping" }));
            }
        }, 25000);

        if (collectBtn && collectTimer) {
            const COLLECT_INTERVAL = 5 * 60 * 1000;
            let lastCollectTime = parseInt(localStorage.getItem('lastCollectTime')) || 0;

            function updateCollectButton() {
                const now = Date.now();
                const timeLeft = COLLECT_INTERVAL - (now - lastCollectTime);
                if (timeLeft <= 0) {
                    collectBtn.disabled = false;
                    collectTimer.textContent = "Готово!";
                } else {
                    collectBtn.disabled = true;
                    const minutes = Math.floor(timeLeft / 60000);
                    const seconds = Math.floor((timeLeft % 60000) / 1000);
                    collectTimer.textContent = `Через ${minutes}:${seconds.toString().padStart(2, "0")}`;
                }
            }

            collectBtn.addEventListener('click', () => {
                const now = Date.now();
                const timeLeft = COLLECT_INTERVAL - (now - lastCollectTime);
                if (timeLeft > 0) return;
                updatePixels(10);
                lastCollectTime = now;
                localStorage.setItem('lastCollectTime', lastCollectTime);
                updateCollectButton();
            });

            setInterval(updateCollectButton, 1000);
            updateCollectButton();
        }
    });
})();