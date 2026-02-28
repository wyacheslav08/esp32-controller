// =========================================================================
// BLE Web Interface - РАБОЧАЯ ВЕРСИЯ С УВЕДОМЛЕНИЯМИ
// =========================================================================

// UUID сервисов и характеристик
const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_TARGET_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a1";
const BLE_CHAR_CURRENT_TEMP_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a2";
const BLE_CHAR_CURRENT_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a3";
const BLE_CHAR_ALL_SETTINGS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a4";
const BLE_CHAR_SYS_INFO_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a5";
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
        .debug-panel { background: #1e1e1e; color: #00ff00; padding: 10px; border-radius: 5px; margin-top: 20px; max-height: 200px; overflow-y: auto; }
        .log-entry { margin: 2px 0; border-bottom: 1px solid #333; }
        .k10-section { margin-top: 20px; padding: 15px; background: #fff3e0; border-radius: 10px; }
        .k10-button { background: #ff9800; color: white; border: none; padding: 15px; border-radius: 50px; font-size: 18px; width: 100%; cursor: pointer; }
        .k10-button:active { background: #e65100; }
        .k10-status { margin-top: 10px; padding: 10px; background: #ffe0b2; border-radius: 8px; }
        .door-closed { background: #c8e6c9; color: #2e7d32; padding: 3px 8px; border-radius: 4px; }
        .door-open { background: #ffcdd2; color: #c62828; padding: 3px 8px; border-radius: 4px; }
        .lock-active { background: #ffeb3b; padding: 5px; text-align: center; border-radius: 4px; animation: blink 1s infinite; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .settings-card { background: white; border-radius: 10px; padding: 15px; margin-top: 20px; }
        .settings-group { background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
        .setting-item { margin: 10px 0; padding: 10px; background: white; border-radius: 8px; }
        .button-group { display: flex; gap: 10px; margin-top: 20px; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        .btn-primary { background: #4caf50; color: white; }
        .btn-secondary { background: #2196f3; color: white; }
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
        entry.style.color = type === 'error' ? '#ff6b6b' : '#00ff00';
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
        await subscribeToNotifications();
        
        updateStatus('✅ Подключено', 'connected');
        connectButton.textContent = '❌ Отключиться';
        connectButton.classList.add('connected');
        connectButton.disabled = false;
        
        createK10Section();
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
        if (uuid.includes('26a1')) characteristics.targetHum = char;
        else if (uuid.includes('26a2')) characteristics.currentTemp = char;
        else if (uuid.includes('26a3')) characteristics.currentHum = char;
        else if (uuid.includes('26a4')) characteristics.allSettings = char;
        else if (uuid.includes('26a5')) characteristics.sysInfo = char;
        else if (uuid.includes('26a6')) characteristics.k10 = char;
    }
    
    log(`✅ Найдено: ${Object.keys(characteristics).length} характеристик`);
}

// =========================================================================
// Уведомления
// =========================================================================

async function subscribeToNotifications() {
    log('Настройка уведомлений...');
    
    const notifyChars = ['currentTemp', 'currentHum', 'sysInfo', 'k10'];
    
    for (const charName of notifyChars) {
        const char = characteristics[charName];
        if (char) {
            try {
                await char.startNotifications();
                char.addEventListener('characteristicvaluechanged', (event) => {
                    handleNotification(charName, event.target.value);
                });
                log(`  ✅ ${charName} уведомления`);
            } catch (e) {
                log(`  ❌ ${charName} ошибка: ${e.message}`, 'error');
            }
        }
    }
}

function handleNotification(charName, value) {
    const decoder = new TextDecoder('utf-8');
    const data = decoder.decode(value);
    
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
        case 'k10':
            parseK10Status(data);
            break;
    }
}

// =========================================================================
// Загрузка данных
// =========================================================================

async function loadAllData() {
    if (characteristics.currentTemp) {
        try {
            const value = await characteristics.currentTemp.readValue();
            const data = new TextDecoder().decode(value);
            if (data.startsWith('T:')) {
                const temp = parseFloat(data.substring(2));
                updateTempDisplay(temp);
            }
        } catch (e) {}
    }
    
    if (characteristics.currentHum) {
        try {
            const value = await characteristics.currentHum.readValue();
            const data = new TextDecoder().decode(value);
            if (data.startsWith('H:')) {
                const hum = parseFloat(data.substring(2));
                updateHumDisplay(hum);
            }
        } catch (e) {}
    }
    
    if (characteristics.allSettings) {
        try {
            const value = await characteristics.allSettings.readValue();
            const data = new TextDecoder().decode(value);
            parseAndDisplaySettings(data);
        } catch (e) {}
    }
    
    if (characteristics.k10) {
        try {
            const value = await characteristics.k10.readValue();
            const data = new TextDecoder().decode(value);
            parseK10Status(data);
        } catch (e) {}
    }
}

// =========================================================================
// Отображение
// =========================================================================

function updateTempDisplay(temp) {
    let el = document.getElementById('temp-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'temp-display';
        el.className = 'sensor-card';
        document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    el.innerHTML = `<div>🌡️ Температура</div><div class="sensor-value">${temp.toFixed(1)}°C</div>`;
}

function updateHumDisplay(hum) {
    let el = document.getElementById('hum-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'hum-display';
        el.className = 'sensor-card';
        const tempEl = document.getElementById('temp-display');
        tempEl ? tempEl.parentNode.insertBefore(el, tempEl.nextSibling) : 
                 document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    el.innerHTML = `<div>💧 Влажность</div><div class="sensor-value">${hum.toFixed(1)}%</div>`;
}

// =========================================================================
// K10 функции
// =========================================================================

function createK10Section() {
    if (document.getElementById('k10-section')) return;
    
    const section = document.createElement('div');
    section.id = 'k10-section';
    section.className = 'k10-section';
    section.innerHTML = `
        <h3>🔒 K10 - Магнитный замок <span id="lock-icon">🔓</span></h3>
        <button id="k10-button" class="k10-button">🔒 Удерживайте для активации</button>
        <div class="k10-status" id="door-status">🚪 Состояние двери: <span class="door-closed">Закрыта</span></div>
        <div class="k10-status" id="hold-time">⏱️ Время удержания: 1000 мс</div>
        <div id="lock-active" style="display:none;" class="lock-active">🔐 ЗАМОК АКТИВИРОВАН</div>
    `;
    document.querySelector('.container').appendChild(section);
    
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
        document.getElementById('lock-active').style.display = 'none';
        isPressed = false;
    }
}

function parseK10Status(data) {
    if (!data) return;
    
    const parts = data.split(',');
    parts.forEach(part => {
        const [key, value] = part.split(':');
        if (key === 'LOCK') {
            document.getElementById('lock-icon').textContent = value === 'active' ? '🔒' : '🔓';
            document.getElementById('lock-active').style.display = value === 'active' ? 'block' : 'none';
        } else if (key === 'DOOR') {
            const doorSpan = document.querySelector('#door-status span');
            doorSpan.textContent = value === 'open' ? 'Открыта' : 'Закрыта';
            doorSpan.className = value === 'open' ? 'door-open' : 'door-closed';
        } else if (key === 'HOLD') {
            document.getElementById('hold-time').innerHTML = `⏱️ Время удержания: ${value} мс`;
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
    
    html += '<div class="settings-group"><h3>🎯 Основные</h3>';
    if (settings.targetHumidity) {
        html += `<div class="setting-item">🌡️ Целевая влажность: <strong>${settings.targetHumidity}%</strong></div>`;
    }
    if (settings.lockHoldTime) {
        html += `<div class="setting-item">🔒 Время удержания: <strong>${settings.lockHoldTime} мс</strong></div>`;
    }
    html += '</div>';
    
    html += '<div class="settings-group"><h3>🔊 Звук</h3>';
    if (settings.doorSoundEnabled !== undefined) {
        const enabled = settings.doorSoundEnabled === '1';
        html += `<div class="setting-item">🚪 Дверь: <span class="${enabled ? 'status-on' : 'status-off'}">${enabled ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    html += '</div>';
    
    html += `
        <div class="button-group">
            <button id="refresh-settings" class="btn btn-secondary">🔄 Обновить</button>
        </div>
    `;
    
    el.innerHTML = html;
    document.getElementById('refresh-settings').onclick = () => loadAllData();
}

// =========================================================================
// Отключение
// =========================================================================

function handleDisconnect() {
    log('❌ Отключено', 'error');
    updateStatus('❌ Отключено', 'disconnected');
    
    if (connectButton) {
        connectButton.textContent = '🔌 Подключиться';
        connectButton.classList.remove('connected');
        connectButton.disabled = false;
    }
    
    gattServer = null;
    service = null;
    characteristics = {};
    
    ['temp-display', 'hum-display', 'k10-section', 'settings-display'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
}
