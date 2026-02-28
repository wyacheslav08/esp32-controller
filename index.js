// =========================================================================
// BLE Web Interface for Guitar Cabinet Controller - ПОЛНАЯ РАБОЧАЯ ВЕРСИЯ
// =========================================================================

// UUID сервисов и характеристик
const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_TARGET_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a1";
const BLE_CHAR_CURRENT_TEMP_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a2";
const BLE_CHAR_CURRENT_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a3";
const BLE_CHAR_ALL_SETTINGS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a4";
const BLE_CHAR_SYS_INFO_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a5";
const BLE_CHAR_K10_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a6";
const BLE_CHAR_COMMAND_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a7";

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

// Временное хранилище измененных настроек
let pendingSettings = {};

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
        
        .status-on {
            color: #4caf50;
            font-weight: bold;
        }
        .status-off {
            color: #f44336;
            font-weight: bold;
        }

        /* Новые стили для групп настроек */
        .settings-group {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            border: 1px solid #e0e0e0;
        }

        .settings-group h3 {
            margin: 0 0 15px 0;
            color: #2196f3;
            font-size: 16px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 5px;
        }

        .checkbox {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .checkbox input[type="checkbox"] {
            width: 20px;
            height: 20px;
            margin-right: 10px;
        }

        .status-indicator {
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }

        .setting-hint {
            display: block;
            color: #666;
            font-size: 11px;
            margin-top: 3px;
        }

        .stat-item {
            padding: 5px 0;
            border-bottom: 1px dashed #e0e0e0;
        }

        .stat-item:last-child {
            border-bottom: none;
        }

        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.3s;
        }

        .btn-primary {
            background: #4caf50;
            color: white;
        }

        .btn-primary:hover {
            background: #388e3c;
        }

        .btn-secondary {
            background: #2196f3;
            color: white;
        }

        .btn-secondary:hover {
            background: #1976d2;
        }

        .btn-danger {
            background: #f44336;
            color: white;
        }

        .btn-danger:hover {
            background: #d32f2f;
        }

        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            flex-wrap: wrap;
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

function updateStatus(text, state) {
    statusText.textContent = text;
    statusLed.classList.remove('status-led-connected');
    
    if (state === 'connected') {
        statusLed.classList.add('status-led-connected');
    }
}

// =========================================================================
// Функции подключения
// =========================================================================

async function connectToDevice() {
    try {
        if (bluetoothDevice && gattServer?.connected) {
            await disconnectFromDevice();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        updateStatus('🔍 Поиск устройств...', 'connecting');
        connectButton.disabled = true;
        connectButton.textContent = '⏳ Поиск...';
        
        log('Запрос устройств с сервисом ' + BLE_SERVICE_UUID);
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'GuitarCabinet' }
            ],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log(`✅ Найдено устройство: ${bluetoothDevice.name}`);
        
        updateStatus('🔌 Подключение...', 'connecting');
        connectButton.textContent = '⏳ Подключение...';
        
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        log('Подключение к GATT серверу...');
        gattServer = await bluetoothDevice.gatt.connect();
        log('✅ GATT сервер подключен');
        
        log('Поиск сервиса...');
        service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
        log('✅ Сервис найден');
        
        await discoverCharacteristics();
        await subscribeToNotifications();
        
        updateStatus('✅ Подключено', 'connected');
        connectButton.textContent = '❌ Отключиться';
        connectButton.classList.add('connected');
        connectButton.disabled = false;
        
        await requestInitialData();
        createK10Section();
        // После того как все характеристики найдены и подписки установлены, 
        // активируйте кнопку K10.
        const k10Button = document.getElementById('k10-button');
        if (k10Button) {
            k10Button.disabled = false; // Разблокировать кнопку K10
        }
        
        if (characteristics.k10) {
            requestK10Status();
        } else {
            log('⚠️ K10 характеристика не найдена', 'warning');
        }
        
    } catch (error) {
        log(`❌ Ошибка: ${error.message}`, 'error');
        updateStatus(`❌ Ошибка: ${error.message}`, 'error');
        connectButton.disabled = false;
        connectButton.textContent = '🔄 Повторить подключение';
        bluetoothDevice = null;
        gattServer = null;
    }
}

async function discoverCharacteristics() {
    log('Поиск характеристик...');
    
    // Создаем регулярные выражения для каждого UUID
    const uuidPatterns = [
        { name: 'targetHum', pattern: new RegExp(BLE_CHAR_TARGET_HUM_UUID.toLowerCase() + '$') },
        { name: 'currentTemp', pattern: new RegExp(BLE_CHAR_CURRENT_TEMP_UUID.toLowerCase() + '$') },
        { name: 'currentHum', pattern: new RegExp(BLE_CHAR_CURRENT_HUM_UUID.toLowerCase() + '$') },
        { name: 'allSettings', pattern: new RegExp(BLE_CHAR_ALL_SETTINGS_UUID.toLowerCase() + '$') },
        { name: 'sysInfo', pattern: new RegExp(BLE_CHAR_SYS_INFO_UUID.toLowerCase() + '$') },
        { name: 'k10', pattern: new RegExp(BLE_CHAR_K10_UUID.toLowerCase() + '$') },
        { name: 'command', pattern: new RegExp(BLE_CHAR_COMMAND_UUID.toLowerCase() + '$') }
    ];
    
    try {
        const characteristics_list = await service.getCharacteristics();
        log(`Найдено характеристик: ${characteristics_list.length}`);
        
        for (let i = 0; i < characteristics_list.length; i++) {
            const char = characteristics_list[i];
            const uuid = char.uuid.toLowerCase();
            log(`  [${i}] UUID: ${uuid}`);
            
            // Проверяем каждый паттерн
            for (const pattern of uuidPatterns) {
                if (pattern.pattern.test(uuid)) {
                    characteristics[pattern.name] = char;
                    log(`    ✅ ${pattern.name}`);
                    break;
                }
            }
        }
    } catch (e) {
        log(`❌ Ошибка: ${e.message}`, 'error');
    }
    
    // Выводим результаты
    const expectedCount = uuidPatterns.length;
    const foundCount = Object.keys(characteristics).length;
    log(`📊 Найдено характеристик: ${foundCount} из ${expectedCount}`);
    
    if (characteristics.k10) {
        log('🎉 K10 успешно найден!');
    } else {
        log('❌ K10 не найден!', 'error');
    }
}

async function subscribeToNotifications() {
    log('Настройка уведомлений...');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Подписываемся на ВСЕ характеристики с уведомлениями
    const notifyChars = ['currentTemp', 'currentHum', 'sysInfo', 'allSettings', 'k10'];
    
    for (const charName of notifyChars) {
        const char = characteristics[charName];
        if (char) {
            try {
                // Пробуем подписаться без проверки свойств
                await char.startNotifications();
                
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
            }
            break;
            
        case 'k10':
            parseK10Status(data);
            break;
            
        case 'allSettings':
            log('🔄 Настройки изменены на устройстве, обновляем...');
            parseAndDisplaySettings(data);
            break;
    }
}

async function disconnectFromDevice() {
    if (gattServer && gattServer.connected) {
        try {
            log('🔌 Отключение...');
            
            for (const charName of ['currentTemp', 'currentHum', 'sysInfo', 'allSettings', 'k10']) {
                const char = characteristics[charName];
                if (char) {
                    try {
                        await char.stopNotifications();
                    } catch (e) {}
                }
            }
            
            gattServer.disconnect();
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            log(`❌ Ошибка при отключении: ${error.message}`, 'error');
        }
    }
    
    gattServer = null;
    service = null;
    characteristics = {};
    
    if (bluetoothDevice) {
        bluetoothDevice.removeEventListener('gattserverdisconnected', handleDisconnect);
        bluetoothDevice = null;
    }
    
    log('🔌 Отключено');
}

function handleDisconnect(event) {
    log('❌ Устройство отключено', 'error');
    updateStatus('❌ Отключено', 'disconnected');
    
    if (connectButton) {
        connectButton.textContent = '🔌 Подключиться к устройству';
        connectButton.classList.remove('connected');
        connectButton.disabled = false;
    }
    
    const k10Section = document.getElementById('k10-section');
    if (k10Section) k10Section.remove();
    
    const displays = ['temp-display', 'hum-display', 'eff-display', 'settings-display'];
    displays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    
    gattServer = null;
    service = null;
    characteristics = {};
}

// =========================================================================
// Функции отображения датчиков
// =========================================================================

function updateTempDisplay(temp) {
    let element = document.getElementById('temp-display');
    
    if (!element) {
        element = document.createElement('div');
        element.id = 'temp-display';
        element.className = 'sensor-card';
        
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
// Функции для кнопки K10
// =========================================================================

function createK10Section() {
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
    setupK10Button();
}

function setupK10Button() {
    const k10Button = document.getElementById('k10-button');
    if (!k10Button) return;
    
    let pressTimer = null;
    let isPressed = false;
    let currentHoldTime = 1000; // По умолчанию
    
    async function sendK10Command(command) {
        if (!characteristics.k10) {
            log('❌ Характеристика K10 не найдена', 'error');
            return false;
        }
        
        try {
            const encoder = new TextEncoder();
            await characteristics.k10.writeValue(encoder.encode(command));
            log(`📤 K10 команда: ${command}`, 'success');
            
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
    
    // Функция обновления времени удержания
    window.updateHoldTime = function(timeMs) {
        currentHoldTime = timeMs;
        const holdTimeElement = document.getElementById('hold-time');
        if (holdTimeElement) {
            holdTimeElement.textContent = timeMs + ' мс';
        }
    };
    
    k10Button.addEventListener('mousedown', startPress);
    k10Button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startPress(e);
    });
    
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
        }, currentHoldTime);
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

// Обновленная parseK10Status
function parseK10Status(data) {
    const parts = data.split(',');
    
    parts.forEach(part => {
        if (part.startsWith('LOCK:')) {
            updateLockStatus(part.substring(5));
        } else if (part.startsWith('DOOR:')) {
            updateDoorStatus(part.substring(5));
        } else if (part.startsWith('HOLD:')) {
            const holdTime = parseInt(part.substring(5));
            if (window.updateHoldTime) {
                window.updateHoldTime(holdTime);
            }
        }
    });
}

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
// Функции работы с настройками - ПОЛНАЯ ВЕРСИЯ
// =========================================================================

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
    
    const settings = {};
    const pairs = data.split(',');
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            settings[key.trim()] = value.trim();
        }
    });
    
    log('📊 Получены настройки:', settings);
    
    let html = '<h2>⚙️ Настройки системы</h2>';
    
    // ========== ОСНОВНЫЕ НАСТРОЙКИ ==========
    html += '<div class="settings-group"><h3>🎯 Основные</h3>';
    
    if (settings.targetHumidity) {
        html += `
            <div class="setting-item">
                <label>🌡️ Целевая влажность: <span id="target-hum-value">${settings.targetHumidity}%</span></label>
                <input type="range" id="target-hum-slider" min="0" max="100" value="${settings.targetHumidity}">
                <span class="setting-hint">Желаемый уровень влажности</span>
            </div>
        `;
    }
    
    if (settings.lockHoldTime) {
        html += `
            <div class="setting-item">
                <label>🔒 Время удержания замка: <span id="lock-hold-value">${settings.lockHoldTime} мс</span></label>
                <input type="range" id="lock-hold-slider" min="100" max="5000" step="100" value="${settings.lockHoldTime}">
                <span class="setting-hint">Сколько держать K10 для активации замка</span>
            </div>
        `;
    }
    html += '</div>';
    
    // ========== ЗВУКОВЫЕ НАСТРОЙКИ ==========
    html += '<div class="settings-group"><h3>🔊 Звуковые оповещения</h3>';
    
    const soundOptions = [
        { key: 'doorSoundEnabled', label: '🚪 Сигнал открытой двери' },
        { key: 'waterSilicaSoundEnabled', label: '💧 Сигнал отсутствия воды/силикагеля' }
    ];
    
    soundOptions.forEach(opt => {
        if (settings[opt.key] !== undefined) {
            const isEnabled = settings[opt.key] === '1';
            html += `
                <div class="setting-item checkbox">
                    <label>
                        <input type="checkbox" id="${opt.key}" ${isEnabled ? 'checked' : ''}>
                        ${opt.label}
                    </label>
                    <span class="status-indicator ${isEnabled ? 'status-on' : 'status-off'}">
                        ${isEnabled ? 'ВКЛ' : 'ВЫКЛ'}
                    </span>
                </div>
            `;
        }
    });
    html += '</div>';
    
    // ========== ПОДОГРЕВ ВОДЫ ==========
    html += '<div class="settings-group"><h3>💧 Подогрев воды</h3>';
    
    if (settings.waterHeaterEnabled !== undefined) {
        const isEnabled = settings.waterHeaterEnabled === '1';
        html += `
            <div class="setting-item checkbox">
                <label>
                    <input type="checkbox" id="waterHeaterEnabled" ${isEnabled ? 'checked' : ''}>
                    Включить подогрев
                </label>
                <span class="status-indicator ${isEnabled ? 'status-on' : 'status-off'}">
                    ${isEnabled ? 'ВКЛ 🔥' : 'ВЫКЛ ❄️'}
                </span>
            </div>
        `;
    }
    
    if (settings.waterHeaterMaxTemp) {
        html += `
            <div class="setting-item">
                <label>🌡️ Макс. температура: <span id="water-temp-value">${settings.waterHeaterMaxTemp}°C</span></label>
                <input type="range" id="water-temp-slider" min="20" max="40" value="${settings.waterHeaterMaxTemp}">
                <span class="setting-hint">Безопасный предел нагрева</span>
            </div>
        `;
    }
    html += '</div>';
    
    // ========== ТАЙМАУТЫ ==========
    html += '<div class="settings-group"><h3>⏱️ Таймауты</h3>';
    
    const timeoutGroups = [
        { key: 'lockTimeIndex', name: '🔐 Блокировка меню', options: ["ОТКЛ", "30 сек", "1 мин", "2 мин", "5 мин"] },
        { key: 'menuTimeoutOptionIndex', name: '📱 Таймаут меню', options: ["ОТКЛ", "15 сек", "30 сек", "1 мин", "2 мин"] },
        { key: 'screenTimeoutOptionIndex', name: '🖥️ Таймаут экрана', options: ["ОТКЛ", "30 сек", "1 мин", "5 мин", "10 мин"] }
    ];
    
    timeoutGroups.forEach(group => {
        if (settings[group.key] !== undefined) {
            const index = parseInt(settings[group.key]);
            html += `
                <div class="setting-item">
                    <label>${group.name}:</label>
                    <select id="${group.key}">
                        ${group.options.map((opt, i) => 
                            `<option value="${i}" ${i === index ? 'selected' : ''}>${opt}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }
    });
    html += '</div>';

    // ========== ПЛАНОВАЯ ПЕРЕЗАГРУЗКА ==========
    html += '<div class="settings-group"><h3>🔄 Плановая перезагрузка</h3>';

    if (settings.autoRebootEnabled !== undefined) {
        const isEnabled = settings.autoRebootEnabled === '1';
        html += `
            <div class="setting-item checkbox">
                <label>
                    <input type="checkbox" id="autoRebootEnabled" ${isEnabled ? 'checked' : ''}>
                    Включить авто-перезагрузку
                </label>
                <span class="status-indicator ${isEnabled ? 'status-on' : 'status-off'}">
                    ${isEnabled ? 'ВКЛ' : 'ВЫКЛ'}
                </span>
            </div>
        `;
    }

    if (settings.autoRebootHour !== undefined) {
        html += `
            <div class="setting-item">
                <label>🕐 Час перезагрузки: <span id="autoRebootHour-value">${settings.autoRebootHour}</span></label>
                <input type="range" id="autoRebootHour-slider" min="0" max="23" value="${settings.autoRebootHour}">
            </div>
        `;
    }

    if (settings.autoRebootMinute !== undefined) {
        html += `
            <div class="setting-item">
                <label>⏱️ Минута перезагрузки: <span id="autoRebootMinute-value">${settings.autoRebootMinute}</span></label>
                <input type="range" id="autoRebootMinute-slider" min="0" max="59" value="${settings.autoRebootMinute}">
            </div>
        `;
    }

    if (settings.autoRebootDays !== undefined) {
        html += `
            <div class="setting-item">
                <label>📅 Интервал (дни): <span id="autoRebootDays-value">${settings.autoRebootDays}</span></label>
                <input type="range" id="autoRebootDays-slider" min="1" max="30" value="${settings.autoRebootDays}">
            </div>
        `;
    }
    html += '</div>';
    
    // ========== ЛОГИКА ВЛАЖНОСТИ ==========
    html += '<div class="settings-group"><h3>💧 Логика влажности</h3>';
    
    const logicParams = [
        { key: 'deadZonePercent', label: '📊 Мертвая зона', unit: '%', min: 0.5, max: 5, step: 0.1, multiplier: 10 },
        { key: 'minHumidityChange', label: '📈 Мин. изменение', unit: '%', min: 0.5, max: 5, step: 0.1, multiplier: 10 },
        { key: 'maxOperationDuration', label: '⏱️ Макс. время работы', unit: 'мин', min: 1, max: 60, step: 1 },
        { key: 'operationCooldown', label: '😴 Время отдыха', unit: 'мин', min: 1, max: 30, step: 1 },
        { key: 'maxSafeHumidity', label: '⚠️ Макс. безопасная влажность', unit: '%', min: 50, max: 100, step: 1 },
        { key: 'resourceCheckDiff', label: '🔄 Порог проверки ресурсов', unit: '%', min: 1, max: 20, step: 1 },
        { key: 'hysteresis', label: '📉 Гистерезис', unit: '%', min: 0.5, max: 5, step: 0.1, multiplier: 10 },
        { key: 'lowFaultThreshold', label: '⚠️ Порог "мало"', unit: '', min: 1, max: 10, step: 1 },
        { key: 'emptyFaultThreshold', label: '⛔ Порог "пусто"', unit: '', min: 1, max: 20, step: 1 }
    ];
    
    logicParams.forEach(param => {
        if (settings[param.key] !== undefined) {
            let value = parseFloat(settings[param.key]);
            let displayValue = value;
            
            if (param.multiplier) {
                displayValue = (value / param.multiplier).toFixed(1);
            }
            
            html += `
                <div class="setting-item">
                    <label>${param.label}: <span id="${param.key}-value">${displayValue}${param.unit}</span></label>
                    <input type="range" id="${param.key}-slider" 
                           min="${param.min}" max="${param.max}" step="${param.step}" 
                           value="${displayValue}">
                </div>
            `;
        }
    });
    html += '</div>';
    
    // ========== КАЛИБРОВКА ДАТЧИКОВ ==========
    html += '<div class="settings-group"><h3>📏 Калибровка DHT</h3>';
    
    const calParams = [
        { key: 'tempOffsetTop', label: '🌡️ Температура (верх)', unit: '°C' },
        { key: 'humOffsetTop', label: '💧 Влажность (верх)', unit: '%' },
        { key: 'tempOffsetHum', label: '🌡️ Температура (увл)', unit: '°C' },
        { key: 'humOffsetHum', label: '💧 Влажность (увл)', unit: '%' }
    ];
    
    calParams.forEach(param => {
        if (settings[param.key] !== undefined) {
            const value = parseInt(settings[param.key]);
            html += `
                <div class="setting-item">
                    <label>${param.label}: <span id="${param.key}-value">${value > 0 ? '+' : ''}${value}${param.unit}</span></label>
                    <input type="range" id="${param.key}-slider" min="-20" max="20" value="${value}">
                </div>
            `;
        }
    });
    html += '</div>';
    
    // ========== КНОПКИ УПРАВЛЕНИЯ ==========
    html += `
        <div class="button-group">
            <button id="save-all-settings" class="btn btn-primary">💾 Сохранить все настройки</button>
            <button id="refresh-settings" class="btn btn-secondary">🔄 Обновить</button>
            <button id="reset-to-defaults" class="btn btn-danger">⚠️ Сброс к заводским</button>
        </div>
    `;

    // ========== СТАТИСТИКА (только для чтения) ==========
    html += '<div class="settings-group"><h3>📊 Статистика (только чтение)</h3>';

    const readOnlyStats = [
        { key: 'wdtResetCount', label: '🔄 Перезагрузок по WDT', icon: '⚠️' },
        { key: 'rebootCounter', label: '🔁 Плановых перезагрузок', icon: '📅' },
        { key: 'resetCount', label: '📊 Полных сбросов', icon: '🔄' }
    ];

    readOnlyStats.forEach(stat => {
        if (settings[stat.key] !== undefined) {
            html += `<div class="stat-item readonly">${stat.icon} ${stat.label}: <strong>${settings[stat.key]}</strong></div>`;
        } else {
            html += `<div class="stat-item readonly">${stat.icon} ${stat.label}: <strong>0</strong></div>`;
        }
    });
    html += '</div>';
    
        element.innerHTML = html;
        setupSettingsHandlers(settings);
}

function setupSettingsHandlers(initialSettings) {
    // Кнопки
    document.getElementById('save-all-settings').onclick = () => saveAllSettings();
    document.getElementById('refresh-settings').onclick = () => requestInitialData();
    
    const resetBtn = document.getElementById('reset-to-defaults');
    if (resetBtn) {
        resetBtn.onclick = async () => {
            if (confirm('⚠️ Сбросить все настройки к заводским?\nУстройство перезагрузится!')) {
                showNotification('🔄 Сброс настроек...', 'info');
                await sendCommand('RESET_TO_DEFAULTS');
                // Ждем перезагрузки
                setTimeout(() => {
                    disconnectFromDevice();
                    showNotification('✅ Устройство перезагружается', 'success');
                }, 2000);
            }
        };
    }
    
    // Целевая влажность
    setupRangeHandler('target-hum-slider', 'target-hum-value', 'targetHumidity', '%');
    
    // Время удержания замка
    setupRangeHandler('lock-hold-slider', 'lock-hold-value', 'lockHoldTime', ' мс');
    
    // Чекбоксы звука
    ['doorSoundEnabled', 'waterSilicaSoundEnabled', 'waterHeaterEnabled'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                pendingSettings[id] = e.target.checked ? '1' : '0';
                updateCheckboxStatus(id, e.target.checked);
            });
        }
    });
    
    // Температура подогрева
    setupRangeHandler('water-temp-slider', 'water-temp-value', 'waterHeaterMaxTemp', '°C');
    
    // Селекты таймаутов
    ['lockTimeIndex', 'menuTimeoutOptionIndex', 'screenTimeoutOptionIndex'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.addEventListener('change', (e) => {
                pendingSettings[id] = e.target.value;
            });
        }
    });
    
    // Параметры логики влажности
    const logicParams = [
        { slider: 'deadZonePercent-slider', value: 'deadZonePercent-value', key: 'deadZonePercent', unit: '%', multiplier: 10 },
        { slider: 'minHumidityChange-slider', value: 'minHumidityChange-value', key: 'minHumidityChange', unit: '%', multiplier: 10 },
        { slider: 'maxOperationDuration-slider', value: 'maxOperationDuration-value', key: 'maxOperationDuration', unit: ' мин' },
        { slider: 'operationCooldown-slider', value: 'operationCooldown-value', key: 'operationCooldown', unit: ' мин' },
        { slider: 'maxSafeHumidity-slider', value: 'maxSafeHumidity-value', key: 'maxSafeHumidity', unit: '%' },
        { slider: 'resourceCheckDiff-slider', value: 'resourceCheckDiff-value', key: 'resourceCheckDiff', unit: '%' },
        { slider: 'hysteresis-slider', value: 'hysteresis-value', key: 'hysteresis', unit: '%', multiplier: 10 },
        { slider: 'lowFaultThreshold-slider', value: 'lowFaultThreshold-value', key: 'lowFaultThreshold', unit: '' },
        { slider: 'emptyFaultThreshold-slider', value: 'emptyFaultThreshold-value', key: 'emptyFaultThreshold', unit: '' }
    ];
    
    logicParams.forEach(param => {
        setupRangeHandler(param.slider, param.value, param.key, param.unit, param.multiplier);
    });
    
    // Калибровка датчиков
    const calParams = [
        'tempOffsetTop-slider', 'humOffsetTop-slider', 
        'tempOffsetHum-slider', 'humOffsetHum-slider'
    ];
    
    calParams.forEach(sliderId => {
        const slider = document.getElementById(sliderId);
        if (slider) {
            const key = sliderId.replace('-slider', '');
            const valueSpan = document.getElementById(key + '-value');
            
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value);
                valueSpan.textContent = (val > 0 ? '+' : '') + val + (key.includes('temp') ? '°C' : '%');
                pendingSettings[key] = val;
            });
        }
    });

    // Чекбокс авто-перезагрузки
    const rebootCheckbox = document.getElementById('autoRebootEnabled');
    if (rebootCheckbox) {
        rebootCheckbox.addEventListener('change', (e) => {
            pendingSettings.autoRebootEnabled = e.target.checked ? '1' : '0';
            updateCheckboxStatus('autoRebootEnabled', e.target.checked);
        });
    }

    // Слайдеры перезагрузки
    setupRangeHandler('autoRebootHour-slider', 'autoRebootHour-value', 'autoRebootHour', '');
    setupRangeHandler('autoRebootMinute-slider', 'autoRebootMinute-value', 'autoRebootMinute', '');
    setupRangeHandler('autoRebootDays-slider', 'autoRebootDays-value', 'autoRebootDays', '');
    }

    // Вспомогательная функция для обработки слайдеров
    function setupRangeHandler(sliderId, valueId, settingsKey, unit, multiplier = 1) {
        const slider = document.getElementById(sliderId);
        const valueSpan = document.getElementById(valueId);
    
        if (slider && valueSpan) {
            slider.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                if (multiplier !== 1) {
                    valueSpan.textContent = val.toFixed(1) + unit;
                    pendingSettings[settingsKey] = Math.round(val * multiplier);
                } else {
                    valueSpan.textContent = val + unit;
                    pendingSettings[settingsKey] = val;
                }
            });
        }
    }

    // Обновление статуса чекбокса
    function updateCheckboxStatus(id, checked) {
        const statusSpan = document.querySelector(`#${id}`).closest('.checkbox').querySelector('.status-indicator');
        if (statusSpan) {
            statusSpan.textContent = checked ? 'ВКЛ' : 'ВЫКЛ';
            statusSpan.className = `status-indicator ${checked ? 'status-on' : 'status-off'}`;
        }
    }

    async function saveAllSettings() {
        if (!characteristics.allSettings) {
            log('❌ Характеристика allSettings не найдена', 'error');
            return;
        }
    
        if (Object.keys(pendingSettings).length === 0) {
            log('ℹ️ Нет изменений для сохранения');
            return;
        }
    
    try {
        // Фильтруем только изменяемые настройки (без статистики)
        /*const editableKeys = [
            'targetHumidity', 'lockHoldTime', 'doorSoundEnabled', 'waterSilicaSoundEnabled',
            'waterHeaterEnabled', 'waterHeaterMaxTemp', 'lockTimeIndex', 'menuTimeoutOptionIndex',
            'screenTimeoutOptionIndex', 'deadZonePercent', 'minHumidityChange', 'maxOperationDuration',
            'operationCooldown', 'maxSafeHumidity', 'resourceCheckDiff', 'hysteresis',
            'lowFaultThreshold', 'emptyFaultThreshold', 'tempOffsetTop', 'humOffsetTop',
            'tempOffsetHum', 'humOffsetHum', 'autoRebootEnabled', 'autoRebootHour',
            'autoRebootMinute', 'autoRebootDays'
        ];*/

        let settingsString = '';
        for (const [key, value] of Object.entries(pendingSettings)) {
            // Здесь уже нет необходимости проверять editableKeys
            if (settingsString.length > 0) settingsString += ',';
            settingsString += `${key}=${value}`;
        }

        if (settingsString.length === 0) {
            log('ℹ️ Нет изменяемых настроек для сохранения');
            pendingSettings = {};
            return;
        }
        
        
        log(`📤 Сохранение настроек: ${settingsString}`);
        
        const encoder = new TextEncoder();
        await characteristics.allSettings.writeValue(encoder.encode(settingsString));
        
        pendingSettings = {};
        showNotification('✅ Настройки сохранены');
        setTimeout(() => requestInitialData(), 500);
        
    } catch (error) {
        log(`❌ Ошибка сохранения: ${error.message}`, 'error');
        showNotification('❌ Ошибка сохранения', 'error');
    }
}

function showNotification(message, type = 'success') {
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
    
    setTimeout(() => {
        notification.style.opacity = '0';
    }, 3000);
}

async function sendCommand(command) {
    if (!characteristics.command) {
        log('❌ Характеристика команд не найдена', 'error');
        return false;
    }
    
    try {
        const encoder = new TextEncoder();
        await characteristics.command.writeValue(encoder.encode(command));
        log(`📤 Команда: ${command}`, 'success');
        return true;
    } catch (error) {
        log(`❌ Ошибка отправки команды: ${error.message}`, 'error');
        return false;
    }
}
