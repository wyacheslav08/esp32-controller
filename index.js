// =========================================================================
// BLE Web Interface - РАБОЧАЯ ВЕРСИЯ С ПРАВИЛЬНЫМ ПАРСИНГОМ
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
let pollingInterval = null;
let pendingSettings = {};

// Элементы DOM
const statusLed = document.querySelector('.status-led');
const statusText = document.getElementById('statusText');
let connectButton = null;
let debugElement = null;

// =========================================================================
// Инициализация
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    connectButton = document.createElement('button');
    connectButton.className = 'connect-btn';
    connectButton.textContent = '🔌 Подключиться к устройству';
    connectButton.onclick = connectToDevice;
    
    const container = document.querySelector('.container');
    container.insertBefore(connectButton, document.querySelector('.status').nextSibling);
    
    debugElement = document.createElement('div');
    debugElement.className = 'debug-panel';
    debugElement.innerHTML = '<h3>📋 Лог:</h3><div id="debug-log"></div>';
    container.appendChild(debugElement);
    
    addStyles();
    log('🚀 Интерфейс загружен');
});

function addStyles() {
    const styles = `
        .sensor-card { background: #f8f9fa; border-radius: 10px; padding: 15px; margin: 10px 0; text-align: center; border: 1px solid #e0e0e0; }
        .sensor-label { font-size: 14px; color: #666; margin-bottom: 5px; }
        .sensor-value { font-size: 32px; font-weight: bold; color: #333; }
        .connect-btn { background: #2196f3; color: white; border: none; padding: 12px 24px; border-radius: 25px; font-size: 16px; cursor: pointer; width: 100%; margin: 20px 0; }
        .connect-btn.connected { background: #f44336; }
        .debug-panel { background: #1e1e1e; color: #00ff00; padding: 10px; border-radius: 5px; margin-top: 20px; max-height: 200px; overflow-y: auto; font-size: 12px; }
        .log-entry { margin: 2px 0; border-bottom: 1px solid #333; }
        .k10-section { margin-top: 20px; padding: 15px; background: #fff3e0; border-radius: 10px; border: 1px solid #ffe0b2; }
        .k10-button { background: #ff9800; color: white; border: none; padding: 15px; border-radius: 50px; font-size: 18px; width: 100%; cursor: pointer; margin: 10px 0; }
        .k10-button:active { background: #e65100; }
        .k10-status { margin-top: 10px; padding: 10px; background: #ffe0b2; border-radius: 8px; }
        .door-closed { background: #c8e6c9; color: #2e7d32; padding: 3px 8px; border-radius: 4px; }
        .door-open { background: #ffcdd2; color: #c62828; padding: 3px 8px; border-radius: 4px; }
        .status-on { color: #4caf50; font-weight: bold; }
        .status-off { color: #f44336; font-weight: bold; }
        .lock-active { background: #ffeb3b; padding: 5px; text-align: center; border-radius: 4px; animation: blink 1s infinite; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .settings-card { background: white; border-radius: 10px; padding: 15px; margin-top: 20px; border: 1px solid #e0e0e0; }
        .settings-group { background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
        .settings-group h3 { margin: 0 0 15px 0; color: #2196f3; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; }
        .setting-item { margin: 10px 0; padding: 10px; background: white; border-radius: 8px; }
        .button-group { display: flex; gap: 10px; margin-top: 20px; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: 500; }
        .btn-primary { background: #4caf50; color: white; }
        .btn-secondary { background: #2196f3; color: white; }
        .btn-danger { background: #f44336; color: white; }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

function log(message, type = 'info') {
    console.log(message);
    const logDiv = document.getElementById('debug-log');
    if (logDiv) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        entry.style.color = type === 'error' ? '#ff6b6b' : (type === 'success' ? '#69db7e' : '#00ff00');
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
// Подключение
// =========================================================================

async function connectToDevice() {
    try {
        if (bluetoothDevice && gattServer?.connected) {
            await disconnectFromDevice();
        }
        
        updateStatus('🔍 Поиск...', 'connecting');
        connectButton.disabled = true;
        connectButton.textContent = '⏳ Поиск...';
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'GuitarCabinet' }],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log(`✅ Найдено: ${bluetoothDevice.name}`);
        
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        gattServer = await bluetoothDevice.gatt.connect();
        log('✅ GATT подключен');
        
        service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
        log('✅ Сервис найден');
        
        await findCharacteristics();
        
        updateStatus('✅ Подключено', 'connected');
        connectButton.textContent = '❌ Отключиться';
        connectButton.classList.add('connected');
        connectButton.disabled = false;
        
        // Создаем интерфейс
        createK10Section();
        
        // Запускаем опрос данных
        startPolling();
        
        // Загружаем начальные данные
        await loadAllData();
        
    } catch (error) {
        log(`❌ Ошибка: ${error.message}`, 'error');
        updateStatus('❌ Ошибка', 'error');
        connectButton.disabled = false;
        connectButton.textContent = '🔄 Повторить';
    }
}

// =========================================================================
// Поиск характеристик
// =========================================================================

async function findCharacteristics() {
    log('Поиск характеристик...');
    
    const chars = await service.getCharacteristics();
    log(`Найдено ${chars.length} характеристик`);
    
    for (let char of chars) {
        const uuid = char.uuid.toLowerCase();
        const shortUuid = uuid.substring(4, 8) + '...' + uuid.substring(28);
        log(`  UUID: ${shortUuid}`);
        
        if (uuid.includes('26a1')) characteristics.targetHum = char;
        else if (uuid.includes('26a2')) characteristics.currentTemp = char;
        else if (uuid.includes('26a3')) characteristics.currentHum = char;
        else if (uuid.includes('26a4')) characteristics.allSettings = char;
        else if (uuid.includes('26a5')) characteristics.sysInfo = char;
        else if (uuid.includes('26a6')) characteristics.k10 = char;
        else if (uuid.includes('26a7')) characteristics.command = char;
    }
    
    log(`✅ Найдено: ${Object.keys(characteristics).length} характеристик`);
}

// =========================================================================
// Загрузка всех данных
// =========================================================================

async function loadAllData() {
    // Загружаем температуру
    if (characteristics.currentTemp) {
        try {
            const value = await characteristics.currentTemp.readValue();
            const data = decodeValue(value);
            log(`🌡️ Temp raw: ${data}`);
            updateTempDisplay(data);
        } catch (e) {}
    }
    
    // Загружаем влажность
    if (characteristics.currentHum) {
        try {
            const value = await characteristics.currentHum.readValue();
            const data = decodeValue(value);
            log(`💧 Hum raw: ${data}`);
            updateHumDisplay(data);
        } catch (e) {}
    }
    
    // Загружаем эффективность
    if (characteristics.sysInfo) {
        try {
            const value = await characteristics.sysInfo.readValue();
            const data = decodeValue(value);
            if (data && data.includes('E:')) {
                updateEfficiencyDisplay(data);
            }
        } catch (e) {}
    }
    
    // Загружаем K10 статус
    if (characteristics.k10) {
        try {
            const value = await characteristics.k10.readValue();
            const data = decodeValue(value);
            log(`🔒 K10 raw: ${data}`);
            if (data) parseK10Status(data);
        } catch (e) {}
    }
    
    // Загружаем настройки
    if (characteristics.allSettings) {
        try {
            const value = await characteristics.allSettings.readValue();
            const data = decodeValue(value);
            log(`⚙️ Settings raw: ${data.substring(0, 50)}...`);
            if (data) parseAndDisplaySettings(data);
        } catch (e) {
            log(`❌ Ошибка чтения настроек: ${e.message}`, 'error');
        }
    }
}

// =========================================================================
// Правильное декодирование данных
// =========================================================================

function decodeValue(value) {
    try {
        // Пробуем разные варианты декодирования
        let result = '';
        
        // Вариант 1: как UTF-8 строку
        const decoder = new TextDecoder('utf-8');
        result = decoder.decode(value);
        
        // Если получили осмысленную строку, возвращаем
        if (result && result.length > 0 && result.charCodeAt(0) < 128) {
            return result;
        }
        
        // Вариант 2: как ASCII
        result = '';
        for (let i = 0; i < value.byteLength; i++) {
            const byte = value.getUint8(i);
            if (byte >= 32 && byte <= 126) { // печатные ASCII символы
                result += String.fromCharCode(byte);
            }
        }
        
        return result;
    } catch (e) {
        return value.toString();
    }
}

// =========================================================================
// Опрос данных по таймеру
// =========================================================================

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        if (!gattServer?.connected) return;
        
        // Читаем температуру
        if (characteristics.currentTemp) {
            try {
                const value = await characteristics.currentTemp.readValue();
                const data = decodeValue(value);
                if (data) {
                    log(`🌡️ Temp: ${data}`);
                    updateTempDisplay(data);
                }
            } catch (e) {}
        }
        
        // Читаем влажность
        if (characteristics.currentHum) {
            try {
                const value = await characteristics.currentHum.readValue();
                const data = decodeValue(value);
                if (data) {
                    log(`💧 Hum: ${data}`);
                    updateHumDisplay(data);
                }
            } catch (e) {}
        }
        
        // Читаем K10 статус
        if (characteristics.k10) {
            try {
                const value = await characteristics.k10.readValue();
                const data = decodeValue(value);
                if (data) {
                    log(`🔒 K10: ${data}`);
                    parseK10Status(data);
                }
            } catch (e) {}
        }
        
    }, 3000);
}

// =========================================================================
// Отображение данных
// =========================================================================

function extractNumber(str) {
    if (!str) return null;
    // Ищем число в строке (может быть с минусом и точкой)
    const match = str.match(/-?\d+\.?\d*/);
    return match ? match[0] : null;
}

function updateTempDisplay(data) {
    let el = document.getElementById('temp-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'temp-display';
        el.className = 'sensor-card';
        document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    
    let value = '--';
    if (data) {
        // Ищем число после "T:"
        if (data.includes('T:')) {
            const num = extractNumber(data.substring(data.indexOf('T:') + 2));
            if (num) value = num;
        } else {
            const num = extractNumber(data);
            if (num) value = num;
        }
    }
    
    el.innerHTML = `
        <div class="sensor-label">🌡️ Температура</div>
        <div class="sensor-value">${value}°C</div>
    `;
}

function updateHumDisplay(data) {
    let el = document.getElementById('hum-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'hum-display';
        el.className = 'sensor-card';
        const tempEl = document.getElementById('temp-display');
        if (tempEl) {
            tempEl.parentNode.insertBefore(el, tempEl.nextSibling);
        } else {
            document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
        }
    }
    
    let value = '--';
    if (data) {
        // Ищем число после "H:"
        if (data.includes('H:')) {
            const num = extractNumber(data.substring(data.indexOf('H:') + 2));
            if (num) value = num;
        } else {
            const num = extractNumber(data);
            if (num) value = num;
        }
    }
    
    el.innerHTML = `
        <div class="sensor-label">💧 Влажность</div>
        <div class="sensor-value">${value}%</div>
    `;
}

function updateEfficiencyDisplay(data) {
    let el = document.getElementById('eff-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'eff-display';
        el.className = 'sensor-card';
        const humEl = document.getElementById('hum-display');
        if (humEl) {
            humEl.parentNode.insertBefore(el, humEl.nextSibling);
        } else {
            document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
        }
    }
    
    let value = '--';
    if (data) {
        if (data.includes('E:')) {
            const num = extractNumber(data.substring(data.indexOf('E:') + 2));
            if (num) value = num;
        } else {
            const num = extractNumber(data);
            if (num) value = num;
        }
    }
    
    el.innerHTML = `
        <div class="sensor-label">⚡ Эффективность</div>
        <div class="sensor-value">${value}%/мин</div>
    `;
}

// =========================================================================
// K10 функции
// =========================================================================

function createK10Section() {
    if (document.getElementById('k10-section')) return;
    
    const container = document.querySelector('.container');
    const section = document.createElement('div');
    section.id = 'k10-section';
    section.className = 'k10-section';
    section.innerHTML = `
        <h3>🔒 K10 - Магнитный замок <span id="lock-icon">🔓</span></h3>
        <button id="k10-button" class="k10-button">🔒 Удерживайте для активации</button>
        <div class="k10-status" id="door-status">🚪 Состояние двери: <span>...</span></div>
        <div class="k10-status" id="hold-time">⏱️ Время удержания: 1000 мс</div>
        <div id="lock-active" style="display:none;" class="lock-active">🔐 ЗАМОК АКТИВИРОВАН</div>
    `;
    container.appendChild(section);
    
    setupK10Button();
}

function setupK10Button() {
    const button = document.getElementById('k10-button');
    if (!button) return;
    
    let pressTimer = null;
    let isPressed = false;
    let holdTime = 1000;
    
    button.addEventListener('mousedown', startPress);
    button.addEventListener('mouseup', releasePress);
    button.addEventListener('mouseleave', releasePress);
    button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startPress();
    });
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        releasePress();
    });
    
    async function sendK10Command(cmd) {
        if (!characteristics.k10) {
            log('❌ K10 характеристика не найдена', 'error');
            return;
        }
        try {
            const encoder = new TextEncoder();
            await characteristics.k10.writeValue(encoder.encode(cmd));
            log(`📤 K10: ${cmd}`);
        } catch (e) {
            log(`❌ K10 ошибка: ${e.message}`, 'error');
        }
    }
    
    function startPress() {
        if (isPressed) return;
        isPressed = true;
        sendK10Command('PRESS');
        button.textContent = '⏳ Удерживайте...';
        
        pressTimer = setTimeout(async () => {
            if (isPressed) {
                await sendK10Command('ACTIVATE');
                button.textContent = '🔒 Замок активирован!';
                document.getElementById('lock-active').style.display = 'block';
                document.getElementById('lock-icon').textContent = '🔒';
            }
        }, holdTime);
    }
    
    function releasePress() {
        if (!isPressed) return;
        clearTimeout(pressTimer);
        sendK10Command('RELEASE');
        button.textContent = '🔒 Удерживайте для активации';
        document.getElementById('lock-active').style.display = 'none';
        isPressed = false;
    }
}

function parseK10Status(data) {
    createK10Section();
    
    if (!data) return;
    
    const parts = data.split(',');
    parts.forEach(part => {
        if (part.startsWith('LOCK:')) {
            const isActive = part.substring(5) === 'active';
            document.getElementById('lock-icon').textContent = isActive ? '🔒' : '🔓';
            document.getElementById('lock-active').style.display = isActive ? 'block' : 'none';
        }
        else if (part.startsWith('DOOR:')) {
            const isOpen = part.substring(5) === 'open';
            const doorSpan = document.querySelector('#door-status span');
            if (doorSpan) {
                doorSpan.textContent = isOpen ? 'Открыта' : 'Закрыта';
                doorSpan.className = isOpen ? 'door-open' : 'door-closed';
            }
        }
        else if (part.startsWith('HOLD:')) {
            const time = part.substring(5);
            document.getElementById('hold-time').innerHTML = `⏱️ Время удержания: ${time} мс`;
        }
    });
}

// =========================================================================
// Настройки
// =========================================================================

function parseAndDisplaySettings(data) {
    let el = document.getElementById('settings-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'settings-display';
        el.className = 'settings-card';
        document.querySelector('.container').appendChild(el);
    }
    
    if (!data) {
        el.innerHTML = '<p>Нет данных настроек</p>';
        return;
    }
    
    const settings = {};
    data.split(',').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) settings[k.trim()] = v.trim();
    });
    
    let html = '<h2>⚙️ Настройки системы</h2>';
    
    // Основные
    html += '<div class="settings-group"><h3>🎯 Основные</h3>';
    if (settings.targetHumidity) {
        html += `<div class="setting-item">🌡️ Целевая влажность: <strong>${settings.targetHumidity}%</strong></div>`;
    }
    if (settings.lockHoldTime) {
        html += `<div class="setting-item">🔒 Время удержания: <strong>${settings.lockHoldTime} мс</strong></div>`;
    }
    html += '</div>';
    
    // Звук
    html += '<div class="settings-group"><h3>🔊 Звуковые оповещения</h3>';
    if (settings.doorSoundEnabled !== undefined) {
        const enabled = settings.doorSoundEnabled === '1';
        html += `<div class="setting-item">🚪 Дверь: <span class="${enabled ? 'status-on' : 'status-off'}">${enabled ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    if (settings.waterSilicaSoundEnabled !== undefined) {
        const enabled = settings.waterSilicaSoundEnabled === '1';
        html += `<div class="setting-item">💧 Ресурсы: <span class="${enabled ? 'status-on' : 'status-off'}">${enabled ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    html += '</div>';
    
    // Подогрев
    html += '<div class="settings-group"><h3>💧 Подогрев воды</h3>';
    if (settings.waterHeaterEnabled !== undefined) {
        const enabled = settings.waterHeaterEnabled === '1';
        html += `<div class="setting-item">⚡ Статус: <span class="${enabled ? 'status-on' : 'status-off'}">${enabled ? 'ВКЛ 🔥' : 'ВЫКЛ ❄️'}</span></div>`;
    }
    if (settings.waterHeaterMaxTemp) {
        html += `<div class="setting-item">🌡️ Макс. температура: <strong>${settings.waterHeaterMaxTemp}°C</strong></div>`;
    }
    html += '</div>';
    
    // Таймауты
    html += '<div class="settings-group"><h3>⏱️ Таймауты</h3>';
    const lockNames = ["ОТКЛ", "30 сек", "1 мин", "2 мин", "5 мин"];
    if (settings.lockTimeIndex !== undefined) {
        const idx = parseInt(settings.lockTimeIndex);
        html += `<div class="setting-item">🔐 Блокировка: <strong>${lockNames[idx] || '?'}</strong></div>`;
    }
    const menuNames = ["ОТКЛ", "15 сек", "30 сек", "1 мин", "2 мин"];
    if (settings.menuTimeoutOptionIndex !== undefined) {
        const idx = parseInt(settings.menuTimeoutOptionIndex);
        html += `<div class="setting-item">📱 Таймаут меню: <strong>${menuNames[idx] || '?'}</strong></div>`;
    }
    const screenNames = ["ОТКЛ", "30 сек", "1 мин", "5 мин", "10 мин"];
    if (settings.screenTimeoutOptionIndex !== undefined) {
        const idx = parseInt(settings.screenTimeoutOptionIndex);
        html += `<div class="setting-item">🖥️ Таймаут экрана: <strong>${screenNames[idx] || '?'}</strong></div>`;
    }
    html += '</div>';
    
    // Кнопка обновления
    html += `
        <div class="button-group">
            <button id="refresh-settings" class="btn btn-secondary">🔄 Обновить данные</button>
        </div>
    `;
    
    el.innerHTML = html;
    
    document.getElementById('refresh-settings').onclick = () => loadAllData();
}

// =========================================================================
// Отключение
// =========================================================================

async function disconnectFromDevice() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    if (gattServer && gattServer.connected) {
        try {
            gattServer.disconnect();
        } catch (e) {}
    }
    
    gattServer = null;
    service = null;
    characteristics = {};
    
    if (bluetoothDevice) {
        bluetoothDevice.removeEventListener('gattserverdisconnected', handleDisconnect);
        bluetoothDevice = null;
    }
    
    handleDisconnect();
}

function handleDisconnect() {
    log('❌ Отключено', 'error');
    updateStatus('❌ Отключено', 'disconnected');
    
    if (connectButton) {
        connectButton.textContent = '🔌 Подключиться к устройству';
        connectButton.classList.remove('connected');
        connectButton.disabled = false;
    }
    
    // Очищаем интерфейс
    ['temp-display', 'hum-display', 'eff-display', 'k10-section', 'settings-display'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
}
