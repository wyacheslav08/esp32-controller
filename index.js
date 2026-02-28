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
        .log-entry { margin: 2px 0; border-bottom: 1px solid #333; padding: 2px; }
        .log-entry.error { color: #ff6b6b; }
        .log-entry.success { color: #69db7e; }
        .k10-section { margin-top: 20px; padding: 15px; background: #fff3e0; border-radius: 10px; border: 1px solid #ffe0b2; }
        .k10-button { background: #ff9800; color: white; border: none; padding: 15px; border-radius: 50px; font-size: 18px; width: 100%; cursor: pointer; margin: 10px 0; }
        .k10-button:active { background: #e65100; }
        .k10-status { margin-top: 10px; padding: 10px; background: #ffe0b2; border-radius: 8px; }
        .door-closed { background: #c8e6c9; color: #2e7d32; padding: 3px 8px; border-radius: 4px; }
        .door-open { background: #ffcdd2; color: #c62828; padding: 3px 8px; border-radius: 4px; }
        .lock-active { background: #ffeb3b; padding: 5px; text-align: center; border-radius: 4px; animation: blink 1s infinite; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .settings-card { background: white; border-radius: 10px; padding: 15px; margin-top: 20px; border: 1px solid #e0e0e0; }
        .settings-group { background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 20px; border: 1px solid #e0e0e0; }
        .settings-group h3 { margin: 0 0 15px 0; color: #2196f3; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; }
        .setting-item { margin: 10px 0; padding: 10px; background: white; border-radius: 8px; border: 1px solid #e0e0e0; }
        .button-group { display: flex; gap: 10px; margin-top: 20px; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: 500; }
        .btn-primary { background: #4caf50; color: white; }
        .btn-secondary { background: #2196f3; color: white; }
        .status-on { color: #4caf50; font-weight: bold; }
        .status-off { color: #f44336; font-weight: bold; }
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
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
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

        log(`✅ Найдено: ${bluetoothDevice.name}`, 'success');
        
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        gattServer = await bluetoothDevice.gatt.connect();
        log('✅ GATT подключен', 'success');
        
        service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
        log('✅ Сервис найден', 'success');
        
        await findCharacteristics();
        
        updateStatus('✅ Подключено', 'connected');
        connectButton.textContent = '❌ Отключиться';
        connectButton.classList.add('connected');
        connectButton.disabled = false;
        
        createK10Section();
        await loadAllData();
        startPolling();
        
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
        log(`  UUID: ${uuid.substring(4, 8)}...${uuid.substring(28)}`);
        
        if (uuid.includes('26a1')) characteristics.targetHum = char;
        else if (uuid.includes('26a2')) characteristics.currentTemp = char;
        else if (uuid.includes('26a3')) characteristics.currentHum = char;
        else if (uuid.includes('26a4')) characteristics.allSettings = char;
        else if (uuid.includes('26a5')) characteristics.sysInfo = char;
        else if (uuid.includes('26a6')) characteristics.k10 = char;
    }
    
    log(`✅ Найдено: ${Object.keys(characteristics).length} характеристик`, 'success');
}

// =========================================================================
// Чтение данных
// =========================================================================

async function readCharacteristic(char, name) {
    if (!char) return null;
    try {
        const value = await char.readValue();
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(value);
    } catch (e) {
        log(`❌ Ошибка чтения ${name}: ${e.message}`, 'error');
        return null;
    }
}

// =========================================================================
// Загрузка всех данных
// =========================================================================

async function loadAllData() {
    log('📥 Загрузка данных...');
    
    // Читаем температуру
    const tempData = await readCharacteristic(characteristics.currentTemp, 'температуры');
    if (tempData && tempData.startsWith('T:')) {
        const temp = parseFloat(tempData.substring(2));
        if (!isNaN(temp)) updateTempDisplay(temp);
    }
    
    // Читаем влажность
    const humData = await readCharacteristic(characteristics.currentHum, 'влажности');
    if (humData && humData.startsWith('H:')) {
        const hum = parseFloat(humData.substring(2));
        if (!isNaN(hum)) updateHumDisplay(hum);
    }
    
    // Читаем эффективность
    const effData = await readCharacteristic(characteristics.sysInfo, 'эффективности');
    if (effData && effData.startsWith('E:')) {
        const eff = parseFloat(effData.substring(2));
        if (!isNaN(eff)) updateEfficiencyDisplay(eff);
    }
    
    // Читаем настройки
    const settingsData = await readCharacteristic(characteristics.allSettings, 'настроек');
    if (settingsData) {
        parseAndDisplaySettings(settingsData);
    }
    
    // Читаем K10 статус
    const k10Data = await readCharacteristic(characteristics.k10, 'K10');
    if (k10Data) {
        parseK10Status(k10Data);
    }
}

// =========================================================================
// Опрос данных
// =========================================================================

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        if (!gattServer?.connected) return;
        
        // Опрашиваем температуру
        const tempData = await readCharacteristic(characteristics.currentTemp, 'температуры');
        if (tempData && tempData.startsWith('T:')) {
            const temp = parseFloat(tempData.substring(2));
            if (!isNaN(temp)) updateTempDisplay(temp);
        }
        
        // Опрашиваем влажность
        const humData = await readCharacteristic(characteristics.currentHum, 'влажности');
        if (humData && humData.startsWith('H:')) {
            const hum = parseFloat(humData.substring(2));
            if (!isNaN(hum)) updateHumDisplay(hum);
        }
        
        // Опрашиваем K10 (реже)
        if (Math.random() < 0.3) {
            const k10Data = await readCharacteristic(characteristics.k10, 'K10');
            if (k10Data) parseK10Status(k10Data);
        }
        
    }, 3000);
}

// =========================================================================
// Отображение датчиков
// =========================================================================

function updateTempDisplay(temp) {
    let el = document.getElementById('temp-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'temp-display';
        el.className = 'sensor-card';
        document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    el.innerHTML = `<div class="sensor-label">🌡️ Температура</div><div class="sensor-value">${temp.toFixed(1)}°C</div>`;
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
    el.innerHTML = `<div class="sensor-label">💧 Влажность</div><div class="sensor-value">${hum.toFixed(1)}%</div>`;
}

function updateEfficiencyDisplay(eff) {
    let el = document.getElementById('eff-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'eff-display';
        el.className = 'sensor-card';
        const humEl = document.getElementById('hum-display');
        humEl ? humEl.parentNode.insertBefore(el, humEl.nextSibling) :
                document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    el.innerHTML = `<div class="sensor-label">⚡ Эффективность</div><div class="sensor-value">${eff.toFixed(1)}%/мин</div>`;
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
            await characteristics.k10.writeValue(new TextEncoder().encode(cmd));
            log(`📤 K10: ${cmd}`, 'success');
            
            // После отправки читаем статус
            setTimeout(async () => {
                const data = await readCharacteristic(characteristics.k10, 'K10');
                if (data) parseK10Status(data);
            }, 500);
            
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
        if (!key || !value) return;
        
        const cleanKey = key.trim();
        const cleanValue = value.trim();
        
        if (cleanKey === 'LOCK') {
            const isActive = cleanValue === 'active';
            document.getElementById('lock-icon').textContent = isActive ? '🔒' : '🔓';
            document.getElementById('lock-active').style.display = isActive ? 'block' : 'none';
        } else if (cleanKey === 'DOOR') {
            const isOpen = cleanValue === 'open';
            const doorSpan = document.querySelector('#door-status span');
            if (doorSpan) {
                doorSpan.textContent = isOpen ? 'Открыта' : 'Закрыта';
                doorSpan.className = isOpen ? 'door-open' : 'door-closed';
            }
        } else if (cleanKey === 'HOLD') {
            document.getElementById('hold-time').innerHTML = `⏱️ Время удержания: ${cleanValue} мс`;
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
    
    // Статистика
    html += '<div class="settings-group"><h3>📊 Статистика</h3>';
    if (settings.wdtResetCount) {
        html += `<div class="setting-item">🔄 WDT сбросов: <strong>${settings.wdtResetCount}</strong></div>`;
    }
    if (settings.rebootCounter) {
        html += `<div class="setting-item">🔁 Перезагрузок: <strong>${settings.rebootCounter}</strong></div>`;
    }
    html += '</div>';
    
    // Кнопки
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
    
    ['temp-display', 'hum-display', 'eff-display', 'k10-section', 'settings-display'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
}
