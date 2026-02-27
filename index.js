// =========================================================================
// BLE Web Interface for Guitar Cabinet Controller - С КНОПКОЙ K10
// =========================================================================

// UUID сервисов и характеристик
const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_TARGET_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a1";
const BLE_CHAR_CURRENT_TEMP_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a2";
const BLE_CHAR_CURRENT_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a3";
const BLE_CHAR_ALL_SETTINGS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a4";
const BLE_CHAR_SYS_INFO_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a5";

// НОВЫЙ UUID для K10
const BLE_CHAR_K10_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a6";

// Глобальные переменные
let bluetoothDevice = null;
let gattServer = null;
let service = null;
let characteristics = {};

// Элементы DOM
const statusLed = document.querySelector('.status-led');
const statusText = document.getElementById('statusText');
let connectButton = null;
let debugElement = null;

// =========================================================================
// Инициализация интерфейса
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Создаем кнопку подключения
    connectButton = document.createElement('button');
    connectButton.className = 'connect-btn';
    connectButton.textContent = '🔌 Подключиться к устройству';
    connectButton.onclick = connectToDevice;
    
    // Вставляем кнопку после статуса
    const container = document.querySelector('.container');
    container.insertBefore(connectButton, document.querySelector('.status').nextSibling);
    
    // Создаем область для отладки
    debugElement = document.createElement('div');
    debugElement.className = 'debug-panel';
    debugElement.innerHTML = '<h3>📋 Лог подключения:</h3><div id="debug-log"></div>';
    container.appendChild(debugElement);
    
    // Добавляем стили
    addStyles();
    
    log('🚀 Интерфейс загружен');
});

/**
 * Добавление стилей
 */
function addStyles() {
    const styles = `
        .sensor-card {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            margin: 10px 0;
            text-align: center;
            border: 1px solid #e0e0e0;
        }
        .sensor-label {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
        }
        .sensor-value {
            font-size: 32px;
            font-weight: bold;
            color: #333;
        }
        .settings-card {
            background: white;
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            border: 1px solid #e0e0e0;
        }
        .settings-card h2 {
            margin: 0 0 15px 0;
            font-size: 18px;
            color: #333;
        }
        .setting-item {
            margin: 15px 0;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e0e0e0;
        }
        .setting-item label {
            display: block;
            margin-bottom: 5px;
            color: #555;
            font-weight: 500;
        }
        .setting-item input[type="range"] {
            width: 100%;
            margin: 5px 0;
        }
        .connect-btn {
            background: #2196f3;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            margin: 20px 0;
            transition: background 0.3s;
        }
        .connect-btn:hover {
            background: #1976d2;
        }
        .connect-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .connect-btn.connected {
            background: #f44336;
        }
        .connect-btn.connected:hover {
            background: #d32f2f;
        }
        .debug-panel {
            background: #1e1e1e;
            color: #00ff00;
            font-family: monospace;
            padding: 10px;
            border-radius: 5px;
            margin-top: 20px;
            max-height: 200px;
            overflow-y: auto;
            font-size: 12px;
        }
        .debug-panel h3 {
            color: #fff;
            margin: 0 0 10px 0;
            font-size: 14px;
        }
        #debug-log {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .log-entry {
            margin: 2px 0;
            border-bottom: 1px solid #333;
            padding: 2px 0;
        }
        
        /* Стили для кнопки K10 */
        .k10-section {
            margin-top: 20px;
            padding: 15px;
            background: #fff3e0;
            border-radius: 10px;
            border: 1px solid #ffe0b2;
        }
        
        .k10-section h3 {
            margin: 0 0 10px 0;
            color: #f57c00;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 18px;
        }
        
        .k10-button {
            background: #ff9800;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 50px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
            transition: all 0.3s;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        
        .k10-button:hover:not(:disabled) {
            background: #f57c00;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        
        .k10-button:active:not(:disabled) {
            transform: translateY(0);
            box-shadow: 0 2px 3px rgba(0,0,0,0.2);
        }
        
        .k10-button.pressed {
            background: #e65100;
            transform: scale(0.98);
        }
        
        .k10-button:disabled {
            background: #ccc;
            cursor: not-allowed;
            opacity: 0.5;
        }
        
        .k10-status {
            margin-top: 10px;
            padding: 10px;
            background: #ffe0b2;
            border-radius: 8px;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .k10-status-label {
            color: #e65100;
            font-weight: 500;
        }
        
        .k10-status-value {
            font-weight: bold;
            color: #333;
        }
        
        .door-status {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .door-closed {
            background: #c8e6c9;
            color: #2e7d32;
        }
        
        .door-open {
            background: #ffcdd2;
            color: #c62828;
        }
        
        .lock-active {
            background: #ffeb3b;
            color: #333;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: bold;
            animation: blink 1s infinite;
        }
        
        @keyframes blink {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

/**
 * Функция для отладки
 */
function log(message, type = 'info') {
    console.log(`📱 [Web] ${message}`);
    
    const logDiv = document.getElementById('debug-log');
    if (logDiv) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        
        if (type === 'error') {
            entry.style.color = '#ff6b6b';
        } else if (type === 'success') {
            entry.style.color = '#69db7e';
        } else if (type === 'warning') {
            entry.style.color = '#ffd93d';
        }
        
        logDiv.appendChild(entry);
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// =========================================================================
// Функции подключения
// =========================================================================

/**
 * Подключение к BLE устройству
 */
async function connectToDevice() {
    try {
        // Если уже подключены, отключаемся
        if (bluetoothDevice && gattServer?.connected) {
            await disconnectFromDevice();
            return;
        }
        
        updateStatus('🔍 Поиск устройств...', 'connecting');
        connectButton.disabled = true;
        connectButton.textContent = '⏳ Поиск...';
        
        log('Запрос устройств с сервисом ' + BLE_SERVICE_UUID);
        
        // Запрос устройства
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'GuitarCabinet' }
            ],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log(`✅ Найдено устройство: ${bluetoothDevice.name}`);
        
        updateStatus('🔌 Подключение...', 'connecting');
        connectButton.textContent = '⏳ Подключение...';
        
        // Обработка отключения
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        // Подключение к серверу GATT
        log('Подключение к GATT серверу...');
        gattServer = await bluetoothDevice.gatt.connect();
        log('✅ GATT сервер подключен');
        
        // Получение сервиса
        log('Поиск сервиса...');
        service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
        log('✅ Сервис найден');
        
        // Получение всех характеристик
        await discoverCharacteristics();
        
        // Подписка на уведомления
        await subscribeToNotifications();
        
        updateStatus('✅ Подключено', 'connected');
        connectButton.textContent = '❌ Отключиться';
        connectButton.classList.add('connected');
        connectButton.disabled = false;
        
        // Запрашиваем начальные данные
        await requestInitialData();
        
        // Создаем секцию K10
        createK10Section();
        
    } catch (error) {
        log(`❌ Ошибка: ${error.message}`, 'error');
        updateStatus(`❌ Ошибка: ${error.message}`, 'error');
        connectButton.disabled = false;
        connectButton.textContent = '🔄 Повторить подключение';
    }
}

/**
 * Отключение от устройства
 */
async function disconnectFromDevice() {
    if (gattServer && gattServer.connected) {
        gattServer.disconnect();
        log('🔌 Отключение...');
    }
}

/**
 * Получение всех характеристик
 */
async function discoverCharacteristics() {
    log('Поиск характеристик...');
    
    // Список характеристик для получения (ДОБАВЛЕНА K10)
    const charUUIDs = [
        { name: 'targetHum', uuid: BLE_CHAR_TARGET_HUM_UUID },
        { name: 'currentTemp', uuid: BLE_CHAR_CURRENT_TEMP_UUID },
        { name: 'currentHum', uuid: BLE_CHAR_CURRENT_HUM_UUID },
        { name: 'allSettings', uuid: BLE_CHAR_ALL_SETTINGS_UUID },
        { name: 'sysInfo', uuid: BLE_CHAR_SYS_INFO_UUID },
        { name: 'k10', uuid: BLE_CHAR_K10_UUID } // НОВАЯ характеристика для K10
    ];
    
    for (const char of charUUIDs) {
        try {
            log(`  - Поиск ${char.name}...`);
            characteristics[char.name] = await service.getCharacteristic(char.uuid);
            log(`    ✅ ${char.name} найден`);
        } catch (e) {
            log(`    ⚠️ ${char.name} не найден: ${e.message}`, 'warning');
        }
    }
}

/**
 * Подписка на уведомления
 */
async function subscribeToNotifications() {
    log('Настройка уведомлений...');
    
    // Характеристики для уведомлений
    const notifyChars = ['currentTemp', 'currentHum', 'sysInfo'];
    
    for (const charName of notifyChars) {
        const char = characteristics[charName];
        if (char) {
            try {
                await char.startNotifications();
                
                // Добавляем обработчик
                char.addEventListener('characteristicvaluechanged', (event) => {
                    handleNotification(charName, event.target.value);
                });
                
                log(`  ✅ ${charName} уведомления активированы`);
            } catch (e) {
                log(`  ❌ ${charName} уведомления не активированы: ${e.message}`, 'error');
            }
        }
    }
}

/**
 * Обработка уведомлений
 */
function handleNotification(charName, value) {
    const decoder = new TextDecoder('utf-8');
    const data = decoder.decode(value);
    
    log(`📨 ${charName}: ${data}`);
    
    switch(charName) {
        case 'currentTemp':
            if (data.startsWith('T:')) {
                const temp = parseFloat(data.substring(2));
                updateTempDisplay(temp);
            }
            break;
            
        case 'currentHum':
            if (data.startsWith('H:')) {
                const hum = parseFloat(data.substring(2));
                updateHumDisplay(hum);
            }
            break;
            
        case 'sysInfo':
            if (data.startsWith('E:')) {
                const eff = parseFloat(data.substring(2));
                updateEfficiencyDisplay(eff);
            } else if (data.startsWith('LOCK:')) {
                // Обновляем статус замка
                updateLockStatus(data.substring(5));
            } else if (data.startsWith('DOOR:')) {
                // Обновляем статус двери
                updateDoorStatus(data.substring(5));
            }
            break;
    }
}

/**
 * Обработка отключения
 */
function handleDisconnect(event) {
    log('❌ Устройство отключено', 'error');
    updateStatus('❌ Отключено', 'disconnected');
    
    if (connectButton) {
        connectButton.textContent = '🔌 Подключиться к устройству';
        connectButton.classList.remove('connected');
        connectButton.disabled = false;
    }
    
    // Удаляем секцию K10
    const k10Section = document.getElementById('k10-section');
    if (k10Section) k10Section.remove();
    
    // Очищаем отображение данных
    const displays = ['temp-display', 'hum-display', 'eff-display', 'settings-display'];
    displays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
}

// =========================================================================
// Функции для кнопки K10
// =========================================================================

/**
 * Создание секции с кнопкой K10
 */
function createK10Section() {
    // Проверяем, существует ли уже секция
    if (document.getElementById('k10-section')) return;
    
    const container = document.querySelector('.container');
    
    const k10Section = document.createElement('div');
    k10Section.id = 'k10-section';
    k10Section.className = 'k10-section';
    
    k10Section.innerHTML = `
        <h3>
            <span>🔒 K10 - Магнитный замок</span>
            <span id="lock-status-icon" style="font-size: 20px;">🔓</span>
        </h3>
        
        <button id="k10-button" class="k10-button">
            <span>🔒</span>
            <span id="k10-button-text">Удерживайте для активации замка</span>
        </button>
        
        <div class="k10-status">
            <span class="k10-status-label">🚪 Состояние двери:</span>
            <span id="door-status" class="door-status door-closed">Закрыта</span>
        </div>
        
        <div class="k10-status">
            <span class="k10-status-label">⏱️ Время удержания:</span>
            <span id="hold-time" class="k10-status-value">1000 мс</span>
        </div>
        
        <div class="k10-status" id="lock-active-indicator" style="display: none;">
            <span class="k10-status-label">🔐 Замок активен</span>
            <span class="lock-active">АКТИВИРОВАН</span>
        </div>
    `;
    
    container.appendChild(k10Section);
    
    // Добавляем обработчики событий
    setupK10Button();
}

/**
 * Настройка обработчиков для кнопки K10
 */
function setupK10Button() {
    const k10Button = document.getElementById('k10-button');
    if (!k10Button) return;
    
    let pressTimer = null;
    let isPressed = false;
    const holdTimeMs = 1000; // Время удержания
    
    // Функция для отправки команды K10
    async function sendK10Command(command) {
        if (!characteristics.k10) {
            log('❌ Характеристика K10 не найдена', 'error');
            return false;
        }
        
        try {
            const encoder = new TextEncoder();
            await characteristics.k10.writeValue(encoder.encode(command));
            log(`📤 K10 команда: ${command}`, 'success');
            
            // Визуальная обратная связь
            if (command === 'PRESS') {
                k10Button.classList.add('pressed');
            } else if (command === 'RELEASE') {
                k10Button.classList.remove('pressed');
            }
            
            return true;
        } catch (error) {
            log(`❌ Ошибка отправки K10 команды: ${error.message}`, 'error');
            return false;
        }
    }
    
    // Обработчик нажатия
    k10Button.addEventListener('mousedown', startPress);
    k10Button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startPress(e);
    });
    
    // Обработчик отпускания
    k10Button.addEventListener('mouseup', releasePress);
    k10Button.addEventListener('mouseleave', releasePress);
    k10Button.addEventListener('touchend', (e) => {
        e.preventDefault();
        releasePress(e);
    });
    k10Button.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        releasePress(e);
    });
    
    function startPress(e) {
        if (isPressed) return;
        isPressed = true;
        
        sendK10Command('PRESS');
        document.getElementById('k10-button-text').textContent = 'Удерживайте...';
        
        pressTimer = setTimeout(async () => {
            if (isPressed) {
                await sendK10Command('ACTIVATE');
                document.getElementById('k10-button-text').textContent = 'Замок активирован!';
                
                const lockIndicator = document.getElementById('lock-active-indicator');
                if (lockIndicator) lockIndicator.style.display = 'flex';
                
                document.getElementById('lock-status-icon').textContent = '🔒';
            }
        }, holdTimeMs);
    }
    
    function releasePress(e) {
        if (!isPressed) return;
        
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        
        sendK10Command('RELEASE');
        document.getElementById('k10-button-text').textContent = 'Удерживайте для активации замка';
        k10Button.classList.remove('pressed');
        
        isPressed = false;
    }
}

/**
 * Запрос статуса K10
 */
async function requestK10Status() {
    if (!characteristics.k10) return;
    
    try {
        const value = await characteristics.k10.readValue();
        const decoder = new TextDecoder('utf-8');
        const data = decoder.decode(value);
        
        log(`📥 K10 статус: ${data}`);
        parseK10Status(data);
    } catch (error) {
        log(`❌ Ошибка чтения статуса K10: ${error.message}`, 'error');
    }
}

/**
 * Парсинг статуса K10
 */
function parseK10Status(data) {
    const parts = data.split(',');
    
    parts.forEach(part => {
        if (part.startsWith('LOCK:')) {
            updateLockStatus(part.substring(5));
        } else if (part.startsWith('DOOR:')) {
            updateDoorStatus(part.substring(5));
        } else if (part.startsWith('HOLD:')) {
            const holdTime = document.getElementById('hold-time');
            if (holdTime) {
                holdTime.textContent = part.substring(5) + ' мс';
            }
        }
    });
}

/**
 * Обновление статуса замка
 */
function updateLockStatus(status) {
    const lockIcon = document.getElementById('lock-status-icon');
    const lockIndicator = document.getElementById('lock-active-indicator');
    
    if (!lockIcon || !lockIndicator) return;
    
    if (status === 'active') {
        lockIcon.textContent = '🔒';
        lockIndicator.style.display = 'flex';
    } else {
        lockIcon.textContent = '🔓';
        lockIndicator.style.display = 'none';
    }
}

/**
 * Обновление статуса двери
 */
function updateDoorStatus(status) {
    const doorElement = document.getElementById('door-status');
    if (!doorElement) return;
    
    if (status === 'open') {
        doorElement.textContent = 'Открыта';
        doorElement.className = 'door-status door-open';
    } else {
        doorElement.textContent = 'Закрыта';
        doorElement.className = 'door-status door-closed';
    }
}

// =========================================================================
// Функции обновления интерфейса
// =========================================================================

function updateStatus(text, state) {
    statusText.textContent = text;
    statusLed.classList.remove('status-led-connected');
    
    if (state === 'connected') {
        statusLed.classList.add('status-led-connected');
    }
}

function updateTempDisplay(temp) {
    let element = document.getElementById('temp-display');
    
    if (!element) {
        element = document.createElement('div');
        element.id = 'temp-display';
        element.className = 'sensor-card';
        
        // Вставляем после статуса
        const status = document.querySelector('.status');
        status.parentNode.insertBefore(element, status.nextSibling);
    }
    
    element.innerHTML = `
        <div class="sensor-label">🌡️ Температура</div>
        <div class="sensor-value">${temp.toFixed(1)}°C</div>
    `;
}

function updateHumDisplay(hum) {
    let element = document.getElementById('hum-display');
    
    if (!element) {
        element = document.createElement('div');
        element.id = 'hum-display';
        element.className = 'sensor-card';
        
        const tempDisplay = document.getElementById('temp-display');
        if (tempDisplay) {
            tempDisplay.parentNode.insertBefore(element, tempDisplay.nextSibling);
        } else {
            const status = document.querySelector('.status');
            status.parentNode.insertBefore(element, status.nextSibling);
        }
    }
    
    element.innerHTML = `
        <div class="sensor-label">💧 Влажность</div>
        <div class="sensor-value">${hum.toFixed(1)}%</div>
    `;
}

function updateEfficiencyDisplay(eff) {
    let element = document.getElementById('eff-display');
    
    if (!element) {
        element = document.createElement('div');
        element.id = 'eff-display';
        element.className = 'sensor-card';
        
        const humDisplay = document.getElementById('hum-display');
        if (humDisplay) {
            humDisplay.parentNode.insertBefore(element, humDisplay.nextSibling);
        } else {
            const status = document.querySelector('.status');
            status.parentNode.insertBefore(element, status.nextSibling);
        }
    }
    
    element.innerHTML = `
        <div class="sensor-label">⚡ Эффективность</div>
        <div class="sensor-value">${eff.toFixed(1)}%/мин</div>
    `;
}

// =========================================================================
// Функции записи данных
// =========================================================================

async function setTargetHumidity(value) {
    if (!characteristics.targetHum) {
        log('❌ Характеристика targetHum не найдена', 'error');
        return;
    }
    
    try {
        const encoder = new TextEncoder();
        await characteristics.targetHum.writeValue(encoder.encode(value.toString()));
        log(`✅ Целевая влажность установлена: ${value}%`, 'success');
    } catch (error) {
        log(`❌ Ошибка записи: ${error.message}`, 'error');
    }
}

async function requestInitialData() {
    if (!characteristics.allSettings) {
        log('❌ Характеристика allSettings не найдена', 'error');
        return;
    }
    
    try {
        log('📥 Запрос настроек...');
        const value = await characteristics.allSettings.readValue();
        const decoder = new TextDecoder('utf-8');
        const data = decoder.decode(value);
        
        log(`📥 Настройки: ${data}`, 'success');
        parseAndDisplaySettings(data);
    } catch (error) {
        log(`❌ Ошибка чтения настроек: ${error.message}`, 'error');
    }
}

function parseAndDisplaySettings(data) {
    let element = document.getElementById('settings-display');
    
    if (!element) {
        element = document.createElement('div');
        element.id = 'settings-display';
        element.className = 'settings-card';
        
        const effDisplay = document.getElementById('eff-display');
        if (effDisplay) {
            effDisplay.parentNode.insertBefore(element, effDisplay.nextSibling);
        } else {
            document.querySelector('.container').appendChild(element);
        }
    }
    
    // Парсим настройки
    const settings = {};
    const pairs = data.split(',');
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            settings[key.trim()] = value.trim();
        }
    });
    
    log('📊 Получены настройки:', settings);
    
    let html = '<h2>⚙️ Настройки</h2>';
    
    // Основные настройки
    if (settings.targetHumidity) {
        html += `
            <div class="setting-item">
                <label>🎯 Целевая влажность: <span id="target-hum-value">${settings.targetHumidity}%</span></label>
                <input type="range" id="target-hum-slider" min="0" max="100" value="${settings.targetHumidity}">
            </div>
        `;
    }
    
    if (settings.lockHoldTime) {
        html += `
            <div class="setting-item">
                <label>🔒 Время удержания замка:</label>
                <span>${settings.lockHoldTime} мс</span>
            </div>
        `;
    }
    
    // Звуковые настройки
    html += '<div class="setting-item"><label>🔊 Звуковые оповещения:</label>';
    if (settings.doorSoundEnabled !== undefined) {
        html += `<div>🚪 Дверь: <span class="${settings.doorSoundEnabled === '1' ? 'status-on' : 'status-off'}">${settings.doorSoundEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    if (settings.waterSilicaSoundEnabled !== undefined) {
        html += `<div>💧 Ресурсы: <span class="${settings.waterSilicaSoundEnabled === '1' ? 'status-on' : 'status-off'}">${settings.waterSilicaSoundEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    html += '</div>';
    
    // Подогрев воды
    if (settings.waterHeaterEnabled !== undefined) {
        html += `
            <div class="setting-item">
                <label>💧 Подогрев воды:</label>
                <div>Статус: <span class="${settings.waterHeaterEnabled === '1' ? 'status-on' : 'status-off'}">${settings.waterHeaterEnabled === '1' ? 'ВКЛ 🔥' : 'ВЫКЛ ❄️'}</span></div>
        `;
        if (settings.waterHeaterMaxTemp) {
            html += `<div>Макс. температура: ${settings.waterHeaterMaxTemp}°C</div>`;
        }
        html += '</div>';
    }
    
    // Таймауты
    html += '<div class="setting-item"><label>⏱️ Таймауты:</label>';
    
    const lockTimeNames = ["ОТКЛ", "30 сек", "1 мин", "2 мин", "5 мин"];
    if (settings.lockTimeIndex !== undefined) {
        const index = parseInt(settings.lockTimeIndex);
        html += `<div>🔐 Блокировка: ${lockTimeNames[index] || settings.lockTimeIndex}</div>`;
    }
    
    const menuTimeoutNames = ["ОТКЛ", "15 сек", "30 сек", "1 мин", "2 мин"];
    if (settings.menuTimeoutOptionIndex !== undefined) {
        const index = parseInt(settings.menuTimeoutOptionIndex);
        html += `<div>📱 Меню: ${menuTimeoutNames[index] || settings.menuTimeoutOptionIndex}</div>`;
    }
    
    const screenTimeoutNames = ["ОТКЛ", "30 сек", "1 мин", "5 мин", "10 мин"];
    if (settings.screenTimeoutOptionIndex !== undefined) {
        const index = parseInt(settings.screenTimeoutOptionIndex);
        html += `<div>🖥️ Экран: ${screenTimeoutNames[index] || settings.screenTimeoutOptionIndex}</div>`;
    }
    html += '</div>';
    
    // Логика влажности
    html += '<div class="setting-item"><label>💧 Логика влажности:</label>';
    if (settings.deadZonePercent) {
        html += `<div>📊 Мертвая зона: ${parseFloat(settings.deadZonePercent).toFixed(1)}%</div>`;
    }
    if (settings.minHumidityChange) {
        html += `<div>📈 Мин. изменение: ${parseFloat(settings.minHumidityChange).toFixed(1)}%</div>`;
    }
    if (settings.maxOperationDuration) {
        html += `<div>⏱️ Макс. время: ${settings.maxOperationDuration} мин</div>`;
    }
    if (settings.operationCooldown) {
        html += `<div>😴 Отдых: ${settings.operationCooldown} мин</div>`;
    }
    if (settings.maxSafeHumidity) {
        html += `<div>⚠️ Макс. безопасная: ${settings.maxSafeHumidity}%</div>`;
    }
    if (settings.resourceCheckDiff) {
        html += `<div>🔄 Порог ресурса: ${settings.resourceCheckDiff}%</div>`;
    }
    if (settings.hysteresis) {
        html += `<div>📉 Гистерезис: ${parseFloat(settings.hysteresis).toFixed(1)}%</div>`;
    }
    if (settings.lowFaultThreshold) {
        html += `<div>⚠️ Порог "Мало": ${settings.lowFaultThreshold}</div>`;
    }
    if (settings.emptyFaultThreshold) {
        html += `<div>⛔ Порог "Нет": ${settings.emptyFaultThreshold}</div>`;
    }
    html += '</div>';
    
    // Счетчики
    html += '<div class="setting-item"><label>📊 Статистика:</label>';
    if (settings.rebootCounter) {
        html += `<div>🔄 Перезагрузок: ${settings.rebootCounter}</div>`;
    }
    if (settings.wdtResetCount) {
        html += `<div>🐕 WDT сбросов: ${settings.wdtResetCount}</div>`;
    }
    html += '</div>';
    
    // Добавляем кнопку "Сохранить все"
    html += `
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="save-all-settings" class="connect-btn" style="background: #4caf50; flex: 2;">💾 Сохранить все настройки</button>
            <button id="refresh-settings" class="connect-btn" style="background: #2196f3; flex: 1;">🔄</button>
        </div>
    `;
    
    element.innerHTML = html;
    
    // Добавляем обработчики
    setupSettingsHandlers(settings);
}
// Временное хранилище измененных настроек
let pendingSettings = {};

/**
 * Настройка обработчиков для элементов настроек
 */
function setupSettingsHandlers(initialSettings) {
    // Кнопка сохранения всех настроек
    const saveBtn = document.getElementById('save-all-settings');
    if (saveBtn) {
        saveBtn.onclick = () => saveAllSettings();
    }
    
    // Кнопка обновления (чтения настроек с устройства)
    const refreshBtn = document.getElementById('refresh-settings');
    if (refreshBtn) {
        refreshBtn.onclick = () => requestInitialData();
    }
    
    // Слайдер целевой влажности
    const humSlider = document.getElementById('target-hum-slider');
    if (humSlider) {
        humSlider.addEventListener('input', (e) => {
            document.getElementById('target-hum-value').textContent = e.target.value + '%';
            // Сохраняем в pending, но не отправляем
            pendingSettings.targetHumidity = e.target.value;
        });
    }
    
    // Можно добавить другие элементы управления
}

/**
 * Сохранение всех настроек одним пакетом
 */
async function saveAllSettings() {
    if (!characteristics.allSettings) {
        log('❌ Характеристика allSettings не найдена', 'error');
        return;
    }
    
    // Если нет ожидающих изменений, выходим
    if (Object.keys(pendingSettings).length === 0) {
        log('ℹ️ Нет изменений для сохранения');
        return;
    }
    
    try {
        // Формируем строку со всеми измененными настройками
        let settingsString = '';
        for (const [key, value] of Object.entries(pendingSettings)) {
            if (settingsString.length > 0) settingsString += ',';
            settingsString += `${key}=${value}`;
        }
        
        log(`📤 Сохранение настроек: ${settingsString}`);
        
        // Отправляем одним пакетом
        const encoder = new TextEncoder();
        await characteristics.allSettings.writeValue(encoder.encode(settingsString));
        
        // Очищаем pending
        pendingSettings = {};
        
        // Показываем сообщение об успехе
        showNotification('✅ Настройки сохранены');
        
        // Обновляем отображение (читаем свежие настройки)
        setTimeout(() => requestInitialData(), 500);
        
    } catch (error) {
        log(`❌ Ошибка сохранения: ${error.message}`, 'error');
        showNotification('❌ Ошибка сохранения', 'error');
    }
}

/**
 * Показ временного уведомления
 */
function showNotification(message, type = 'success') {
    // Создаем или находим элемент уведомления
    let notification = document.getElementById('settings-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'settings-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#4caf50' : '#f44336'};
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 1000;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.opacity = '1';
    
    // Скрываем через 3 секунды
    setTimeout(() => {
        notification.style.opacity = '0';
    }, 3000);
}
