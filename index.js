// index.js - ФИНАЛЬНАЯ СТАБИЛЬНАЯ ВЕРСИЯ

// --- НАСТРОЙКА UUID (Должны совпадать с кодом ESP32) ---
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_CHAR_TEMP_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a2';
const BLE_CHAR_HUM_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a3';
const BLE_CHAR_SYS_INFO_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a5';

// --- Глобальные переменные ---
let device = null;
let server = null;
let service = null;
let tempChar = null;
let humChar = null;
let sysInfoChar = null;
let pollingInterval = null;

// --- DOM элементы ---
const statusLed = document.querySelector('.status-led');
const statusText = document.getElementById('statusText');
const tempSpan = document.getElementById('tempValue');
const humSpan = document.getElementById('humValue');
const effSpan = document.getElementById('effValue');
const logDiv = document.getElementById('log');

// --- Вспомогательные функции ---
function log(message) {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logMessage = `${timestamp}: ${message}`;
    console.log(logMessage);
    if (logDiv) {
        logDiv.innerHTML += logMessage + '<br>';
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

function updateConnectionStatus(connected) {
    if (connected) {
        statusLed.className = 'status-led status-led-connected';
        statusText.textContent = 'Подключено';
        log('✅ Подключено к устройству');
    } else {
        statusLed.className = 'status-led';
        statusText.textContent = 'Отключено';
        log('❌ Отключено');
        // Показываем кнопку подключения снова
        const connectBtn = document.querySelector('.connect-btn');
        if (connectBtn) connectBtn.style.display = 'block';
        // Очищаем значения на странице
        if (tempSpan) tempSpan.textContent = '--';
        if (humSpan) humSpan.textContent = '--';
        if (effSpan) effSpan.textContent = '--';
        // Останавливаем опрос, если он был активен
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }
}

// --- Обработчики входящих данных ---
function handleTempUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    // Ожидаем формат "T:25.5" или просто "25.5"
    const numStr = value.replace('T:', '');
    const temp = parseFloat(numStr);
    if (!isNaN(temp) && tempSpan) {
        tempSpan.textContent = temp.toFixed(1);
        log(`🌡️ Температура: ${temp.toFixed(1)}°C`);
    }
}

function handleHumUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    const numStr = value.replace('H:', '');
    const hum = parseFloat(numStr);
    if (!isNaN(hum) && humSpan) {
        humSpan.textContent = hum.toFixed(1);
        log(`💧 Влажность: ${hum.toFixed(1)}%`);
    }
}

function handleSysInfoUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    if (value.startsWith('E:') || value.startsWith('eff:')) {
        const numStr = value.replace('E:', '').replace('eff:', '');
        const eff = parseFloat(numStr);
        if (!isNaN(eff) && effSpan) {
            effSpan.textContent = eff.toFixed(1);
            log(`📈 Эффективность: ${eff.toFixed(1)}%/мин`);
        }
    } else if (value === 'ping') {
        // Игнорируем служебные сообщения
    }
}

// --- Функции для чтения данных ---
async function readAllCharacteristics() {
    if (!device || !device.gatt.connected) return;
    try {
        const tempValue = await tempChar.readValue();
        const humValue = await humChar.readValue();
        const sysValue = await sysInfoChar.readValue();
        // Вызываем обработчики вручную
        handleTempUpdate({ target: { value: tempValue } });
        handleHumUpdate({ target: { value: humValue } });
        handleSysInfoUpdate({ target: { value: sysValue } });
    } catch (e) {
        log('⚠️ Ошибка при чтении характеристик: ' + e.message);
    }
}

// --- Режимы работы (Уведомления или Опрос) ---
async function setupNotifications() {
    log('📨 Включение уведомлений...');
    await tempChar.startNotifications();
    tempChar.addEventListener('characteristicvaluechanged', handleTempUpdate);
    await humChar.startNotifications();
    humChar.addEventListener('characteristicvaluechanged', handleHumUpdate);
    await sysInfoChar.startNotifications();
    sysInfoChar.addEventListener('characteristicvaluechanged', handleSysInfoUpdate);
    log('✅ Уведомления включены');
}

function startPolling() {
    log('🔄 Запуск режима опроса (каждые 2 секунды)');
    // Читаем сразу после запуска
    readAllCharacteristics();
    // И запускаем интервал
    pollingInterval = setInterval(readAllCharacteristics, 2000);
}

// --- Основная функция подключения ---
async function connect() {
    try {
        // Скрываем кнопку и очищаем статус
        const connectBtn = document.querySelector('.connect-btn');
        if (connectBtn) connectBtn.style.display = 'none';
        updateConnectionStatus(false);
        
        log('🔍 Поиск устройств...');
        statusText.textContent = 'Поиск...';

        device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'GuitarCabinet' }],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log('✅ Найдено: ' + device.name);
        statusText.textContent = 'Найдено: ' + device.name;

        device.addEventListener('gattserverdisconnected', onDisconnected);

        log('🔌 Подключение...');
        statusText.textContent = 'Подключение...';
        server = await device.gatt.connect();

        log('📡 Получение сервиса...');
        service = await server.getPrimaryService(BLE_SERVICE_UUID);

        log('📊 Получение характеристик...');
        tempChar = await service.getCharacteristic(BLE_CHAR_TEMP_UUID);
        humChar = await service.getCharacteristic(BLE_CHAR_HUM_UUID);
        sysInfoChar = await service.getCharacteristic(BLE_CHAR_SYS_INFO_UUID);

        // Сначала читаем начальные значения
        await readAllCharacteristics();

        // Пытаемся включить уведомления, если не получится - переходим в режим опроса
        try {
            await setupNotifications();
        } catch (e) {
            log('⚠️ Не удалось включить уведомления: ' + e.message);
            startPolling();
        }

        updateConnectionStatus(true);

    } catch (error) {
        log('❌ Ошибка: ' + error.message);
        statusText.textContent = 'Ошибка: ' + error.message;
        updateConnectionStatus(false);
        // Показываем кнопку снова в случае ошибки
        const connectBtn = document.querySelector('.connect-btn');
        if (connectBtn) connectBtn.style.display = 'block';
    }
}

// --- Обработчик отключения ---
function onDisconnected() {
    updateConnectionStatus(false);
    device = null;
    server = null;
}

// --- Инициализация страницы ---
window.addEventListener('load', () => {
    // Создаем кнопку подключения, если её нет в HTML
    if (!document.querySelector('.connect-btn')) {
        const container = document.querySelector('.container');
        const connectBtn = document.createElement('button');
        connectBtn.className = 'connect-btn';
        connectBtn.textContent = '🔌 Подключиться к устройству';
        connectBtn.style.cssText = `
            background: #4caf50;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
            width: 100%;
            margin-top: 20px;
            transition: background 0.3s;
        `;
        connectBtn.onmouseover = () => { connectBtn.style.background = '#45a049'; };
        connectBtn.onmouseout = () => { connectBtn.style.background = '#4caf50'; };
        connectBtn.onclick = connect;
        container.appendChild(connectBtn);
    }

    // Создаем панель лога, если её нет
    if (!logDiv) {
        const container = document.querySelector('.container');
        const newLogDiv = document.createElement('div');
        newLogDiv.id = 'log';
        newLogDiv.style.cssText = `
            margin-top: 20px;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            max-height: 150px;
            overflow-y: auto;
            border: 1px solid #ddd;
        `;
        container.appendChild(newLogDiv);
    }

    log('✅ Страница загружена. Нажмите кнопку для подключения.');
});

// --- Проверка поддержки Web Bluetooth ---
if (!navigator.bluetooth) {
    log('❌ Web Bluetooth не поддерживается в этом браузере.');
    if (statusText) statusText.textContent = 'Web Bluetooth не поддерживается';
}
