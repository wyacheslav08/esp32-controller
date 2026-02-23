// =========================================================================
// BLE Web Interface for Guitar Cabinet Controller - ИСПРАВЛЕННАЯ ВЕРСИЯ
// =========================================================================

// UUID сервисов и характеристик
const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_TARGET_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a1";
const BLE_CHAR_CURRENT_TEMP_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a2";
const BLE_CHAR_CURRENT_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a3";
const BLE_CHAR_ALL_SETTINGS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a4";
const BLE_CHAR_SYS_INFO_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a5";

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
    
    // Список характеристик для получения
    const charUUIDs = [
        { name: 'targetHum', uuid: BLE_CHAR_TARGET_HUM_UUID },
        { name: 'currentTemp', uuid: BLE_CHAR_CURRENT_TEMP_UUID },
        { name: 'currentHum', uuid: BLE_CHAR_CURRENT_HUM_UUID },
        { name: 'allSettings', uuid: BLE_CHAR_ALL_SETTINGS_UUID },
        { name: 'sysInfo', uuid: BLE_CHAR_SYS_INFO_UUID }
    ];
    
    for (const char of charUUIDs) {
        try {
            log(`  - Поиск ${char.name}...`);
            characteristics[char.name] = await service.getCharacteristic(char.uuid);
            log(`    ✅ ${char.name} найден`);
        } catch (e) {
            log(`    ❌ ${char.name} не найден: ${e.message}`, 'error');
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
    
    // Очищаем отображение данных
    const displays = ['temp-display', 'hum-display', 'eff-display', 'settings-display'];
    displays.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
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
            settings[key] = value;
        }
    });
    
    log('📊 Получены настройки:', settings);
    
    let html = '<h2>⚙️ Настройки</h2>';
    
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
    
    if (settings.waterHeaterEnabled !== undefined) {
        html += `
            <div class="setting-item">
                <label>💧 Подогрев воды:</label>
                <span class="${settings.waterHeaterEnabled === '1' ? 'status-on' : 'status-off'}">
                    ${settings.waterHeaterEnabled === '1' ? 'ВКЛ 🔥' : 'ВЫКЛ ❄️'}
                </span>
            </div>
        `;
    }
    
    element.innerHTML = html;
    
    // Добавляем обработчик для слайдера
    const slider = document.getElementById('target-hum-slider');
    const valueSpan = document.getElementById('target-hum-value');
    
    if (slider && valueSpan) {
        slider.addEventListener('input', (e) => {
            valueSpan.textContent = e.target.value + '%';
        });
        
        slider.addEventListener('change', (e) => {
            setTargetHumidity(e.target.value);
        });
    }
}

// Добавляем стили для статусов
const additionalStyles = `
    .status-on {
        color: #4caf50;
        font-weight: bold;
    }
    .status-off {
        color: #f44336;
        font-weight: bold;
    }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);
