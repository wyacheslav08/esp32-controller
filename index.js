// =========================================================================
// BLE Web Interface - РАБОЧАЯ ВЕРСИЯ С ОПРОСОМ
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
        .sensor-card { background: #f8f9fa; border-radius: 10px; padding: 15px; margin: 10px 0; text-align: center; }
        .sensor-value { font-size: 32px; font-weight: bold; color: #333; }
        .connect-btn { background: #2196f3; color: white; border: none; padding: 12px 24px; border-radius: 25px; font-size: 16px; cursor: pointer; width: 100%; margin: 20px 0; }
        .connect-btn.connected { background: #f44336; }
        .debug-panel { background: #1e1e1e; color: #00ff00; padding: 10px; border-radius: 5px; margin-top: 20px; max-height: 200px; overflow-y: auto; font-size: 12px; }
        .log-entry { margin: 2px 0; border-bottom: 1px solid #333; }
        .k10-section { margin-top: 20px; padding: 15px; background: #fff3e0; border-radius: 10px; }
        .k10-button { background: #ff9800; color: white; border: none; padding: 15px; border-radius: 50px; font-size: 18px; width: 100%; cursor: pointer; }
        .k10-button:active { background: #e65100; }
        .status-on { color: #4caf50; font-weight: bold; }
        .status-off { color: #f44336; font-weight: bold; }
        .settings-group { background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
        .setting-item { margin: 15px 0; padding: 10px; background: white; border-radius: 8px; }
        .button-group { display: flex; gap: 10px; margin-top: 20px; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
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
        log(`  UUID: ${uuid.substring(0, 8)}...${uuid.substring(28)}`);
        
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
    // Загружаем настройки
    if (characteristics.allSettings) {
        try {
            const value = await characteristics.allSettings.readValue();
            const data = new TextDecoder().decode(value);
            log('📥 Настройки получены');
            parseAndDisplaySettings(data);
        } catch (e) {
            log(`❌ Ошибка чтения настроек: ${e.message}`, 'error');
        }
    }
    
    // Загружаем температуру
    if (characteristics.currentTemp) {
        try {
            const value = await characteristics.currentTemp.readValue();
            const data = new TextDecoder().decode(value);
            updateTempDisplay(data);
        } catch (e) {}
    }
    
    // Загружаем влажность
    if (characteristics.currentHum) {
        try {
            const value = await characteristics.currentHum.readValue();
            const data = new TextDecoder().decode(value);
            updateHumDisplay(data);
        } catch (e) {}
    }
    
    // Загружаем K10 статус
    if (characteristics.k10) {
        try {
            const value = await characteristics.k10.readValue();
            const data = new TextDecoder().decode(value);
            parseK10Status(data);
        } catch (e) {}
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
                const data = new TextDecoder().decode(value);
                updateTempDisplay(data);
            } catch (e) {}
        }
        
        // Читаем влажность
        if (characteristics.currentHum) {
            try {
                const value = await characteristics.currentHum.readValue();
                const data = new TextDecoder().decode(value);
                updateHumDisplay(data);
            } catch (e) {}
        }
        
        // Читаем K10 статус
        if (characteristics.k10) {
            try {
                const value = await characteristics.k10.readValue();
                const data = new TextDecoder().decode(value);
                parseK10Status(data);
            } catch (e) {}
        }
        
    }, 3000); // Каждые 3 секунды
}

// =========================================================================
// Отображение данных
// =========================================================================

function updateTempDisplay(data) {
    let el = document.getElementById('temp-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'temp-display';
        el.className = 'sensor-card';
        document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    const value = data.startsWith('T:') ? data.substring(2) : data;
    el.innerHTML = `<div>🌡️ Температура</div><div class="sensor-value">${value}°C</div>`;
}

function updateHumDisplay(data) {
    let el = document.getElementById('hum-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'hum-display';
        el.className = 'sensor-card';
        const tempEl = document.getElementById('temp-display');
        tempEl ? tempEl.parentNode.insertBefore(el, tempEl.nextSibling) : 
                 document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    const value = data.startsWith('H:') ? data.substring(2) : data;
    el.innerHTML = `<div>💧 Влажность</div><div class="sensor-value">${value}%</div>`;
}

function updateEfficiencyDisplay(data) {
    let el = document.getElementById('eff-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'eff-display';
        el.className = 'sensor-card';
        const humEl = document.getElementById('hum-display');
        humEl ? humEl.parentNode.insertBefore(el, humEl.nextSibling) :
                document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    const value = data.startsWith('E:') ? data.substring(2) : data;
    el.innerHTML = `<div>⚡ Эффективность</div><div class="sensor-value">${value}%/мин</div>`;
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
        <div style="margin-top:10px;" id="door-status">🚪 Состояние двери: ...</div>
        <div id="hold-time">⏱️ Время удержания: 1000 мс</div>
        <div id="lock-active" style="display:none; background:#ffeb3b; padding:5px; margin-top:10px; text-align:center;">🔐 ЗАМОК АКТИВИРОВАН</div>
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
    
    async function sendK10Command(cmd) {
        if (!characteristics.k10) return;
        try {
            await characteristics.k10.writeValue(new TextEncoder().encode(cmd));
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
        isPressed = false;
    }
}

function parseK10Status(data) {
    createK10Section();
    
    const parts = data.split(',');
    parts.forEach(part => {
        if (part.startsWith('LOCK:')) {
            const isActive = part.substring(5) === 'active';
            document.getElementById('lock-icon').textContent = isActive ? '🔒' : '🔓';
            document.getElementById('lock-active').style.display = isActive ? 'block' : 'none';
        }
        else if (part.startsWith('DOOR:')) {
            const isOpen = part.substring(5) === 'open';
            document.getElementById('door-status').innerHTML = `🚪 Состояние двери: <span class="${isOpen ? 'door-open' : 'door-closed'}">${isOpen ? 'Открыта' : 'Закрыта'}</span>`;
        }
        else if (part.startsWith('HOLD:')) {
            const time = part.substring(5);
            document.getElementById('hold-time').textContent = `⏱️ Время удержания: ${time} мс`;
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
    
    const settings = {};
    data.split(',').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) settings[k.trim()] = v.trim();
    });
    
    let html = '<h2>⚙️ Настройки</h2>';
    
    // Основные
    html += '<div class="settings-group"><h3>🎯 Основные</h3>';
    if (settings.targetHumidity) {
        html += `<div class="setting-item">🌡️ Целевая влажность: ${settings.targetHumidity}%</div>`;
    }
    if (settings.lockHoldTime) {
        html += `<div class="setting-item">🔒 Время удержания: ${settings.lockHoldTime} мс</div>`;
    }
    html += '</div>';
    
    // Звук
    html += '<div class="settings-group"><h3>🔊 Звук</h3>';
    if (settings.doorSoundEnabled) {
        html += `<div class="setting-item">🚪 Дверь: <span class="${settings.doorSoundEnabled === '1' ? 'status-on' : 'status-off'}">${settings.doorSoundEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    if (settings.waterSilicaSoundEnabled) {
        html += `<div class="setting-item">💧 Ресурсы: <span class="${settings.waterSilicaSoundEnabled === '1' ? 'status-on' : 'status-off'}">${settings.waterSilicaSoundEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    html += '</div>';
    
    // Подогрев
    if (settings.waterHeaterEnabled) {
        html += '<div class="settings-group"><h3>💧 Подогрев</h3>';
        html += `<div class="setting-item">Статус: <span class="${settings.waterHeaterEnabled === '1' ? 'status-on' : 'status-off'}">${settings.waterHeaterEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
        if (settings.waterHeaterMaxTemp) {
            html += `<div class="setting-item">Макс. температура: ${settings.waterHeaterMaxTemp}°C</div>`;
        }
        html += '</div>';
    }
    
    // Статистика
    html += '<div class="settings-group"><h3>📊 Статистика</h3>';
    if (settings.wdtResetCount) {
        html += `<div class="setting-item">🔄 WDT сбросов: ${settings.wdtResetCount}</div>`;
    }
    if (settings.rebootCounter) {
        html += `<div class="setting-item">🔁 Перезагрузок: ${settings.rebootCounter}</div>`;
    }
    html += '</div>';
    
    // Кнопки
    html += `
        <div class="button-group">
            <button id="save-settings" class="btn btn-primary">💾 Сохранить</button>
            <button id="refresh-settings" class="btn btn-secondary">🔄 Обновить</button>
        </div>
    `;
    
    el.innerHTML = html;
    
    document.getElementById('refresh-settings').onclick = () => loadAllData();
    document.getElementById('save-settings').onclick = () => saveSettings();
}

async function saveSettings() {
    if (!characteristics.allSettings) return;
    // Пока просто заглушка
    log('ℹ️ Сохранение настроек будет позже');
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
