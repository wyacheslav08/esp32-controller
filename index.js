// ==========================================================================
// BLE Web Interface for Guitar Cabinet - ПОЛНАЯ ВЕРСИЯ
// ==========================================================================

// UUID сервиса и характеристик
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
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// Элементы DOM
const statusLed = document.getElementById('statusLed');
const statusText = document.getElementById('statusText');
const connectBtn = document.getElementById('connectBtn');
const resetBtn = document.getElementById('resetBtn');
const k10Btn = document.getElementById('k10Btn');
const tempValue = document.getElementById('tempValue');
const humValue = document.getElementById('humValue');
const effValue = document.getElementById('effValue');
const targetValue = document.getElementById('targetValue');
const settingsContainer = document.getElementById('settingsContainer');
const settingsStatus = document.getElementById('settingsStatus');
const waterStatus = document.getElementById('waterStatus');
const waterText = document.getElementById('waterText');
const silicaStatus = document.getElementById('silicaStatus');
const silicaText = document.getElementById('silicaText');
const debugLog = document.getElementById('debugLog');

// ==========================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================================================

function log(message, type = 'info') {
    console.log(`📱 [BLE] ${message}`);
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    
    const time = new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    entry.textContent = `[${time}] ${message}`;
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight;
}

function updateStatus(text, isConnected) {
    statusText.textContent = text;
    
    if (isConnected) {
        statusLed.classList.add('status-led-connected');
        connectBtn.textContent = '❌ Отключиться';
        connectBtn.classList.add('connected');
        resetBtn.disabled = false;
        k10Btn.disabled = false;
        settingsStatus.textContent = 'подключено';
        settingsStatus.style.background = '#c8e6c9';
        settingsStatus.style.color = '#2e7d32';
    } else {
        statusLed.classList.remove('status-led-connected');
        connectBtn.textContent = '🔌 Подключиться';
        connectBtn.classList.remove('connected');
        resetBtn.disabled = true;
        k10Btn.disabled = true;
        settingsStatus.textContent = 'нет связи';
        settingsStatus.style.background = '#ffcdd2';
        settingsStatus.style.color = '#c62828';
    }
}

function toggleDebug() {
    const log = document.getElementById('debugLog');
    const toggle = document.getElementById('debugToggle');
    
    if (log.style.display === 'none') {
        log.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        log.style.display = 'none';
        toggle.textContent = '▶';
    }
}

// ==========================================================================
// ПОДКЛЮЧЕНИЕ К BLE
// ==========================================================================

async function connectToDevice() {
    try {
        if (gattServer && gattServer.connected) {
            await disconnectFromDevice();
            return;
        }
        
        updateStatus('🔍 Поиск устройств...', false);
        connectBtn.disabled = true;
        resetBtn.disabled = true;
        
        log('Поиск устройств GuitarCabinet...');
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'GuitarCabinet' }
            ],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log(`✅ Найдено: ${bluetoothDevice.name}`);
        
        updateStatus('🔌 Подключение...', false);
        
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        gattServer = await bluetoothDevice.gatt.connect();
        log('✅ GATT сервер подключен');
        
        service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
        log('✅ Сервис найден');
        
        await discoverCharacteristics();
        await subscribeToNotifications();
        
        updateStatus('✅ Подключено', true);
        connectBtn.disabled = false;
        reconnectAttempts = 0;
        
        await readAllSettings();
        
    } catch (error) {
        log(`❌ Ошибка: ${error.message}`, 'error');
        updateStatus('❌ Ошибка подключения', false);
        connectBtn.disabled = false;
        
        reconnectAttempts++;
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            log(`🔄 Попытка переподключения ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
            setTimeout(connectToDevice, 2000);
        }
    }
}

async function disconnectFromDevice() {
    if (gattServer && gattServer.connected) {
        gattServer.disconnect();
    }
}

function handleDisconnect() {
    log('❌ Устройство отключено', 'error');
    updateStatus('❌ Отключено', false);
    connectBtn.disabled = false;
    characteristics = {};
    gattServer = null;
    
    // Очищаем отображение
    tempValue.textContent = '--';
    humValue.textContent = '--';
    effValue.textContent = '--';
}

async function resetBLE() {
    log('🔄 Принудительный сброс BLE...');
    
    if (gattServer && gattServer.connected) {
        await disconnectFromDevice();
    }
    
    setTimeout(() => {
        connectToDevice();
    }, 1000);
}

async function discoverCharacteristics() {
    log('Поиск характеристик...');
    
    const charList = [
        { name: 'targetHum', uuid: BLE_CHAR_TARGET_HUM_UUID },
        { name: 'currentTemp', uuid: BLE_CHAR_CURRENT_TEMP_UUID },
        { name: 'currentHum', uuid: BLE_CHAR_CURRENT_HUM_UUID },
        { name: 'allSettings', uuid: BLE_CHAR_ALL_SETTINGS_UUID },
        { name: 'sysInfo', uuid: BLE_CHAR_SYS_INFO_UUID }
    ];
    
    for (const char of charList) {
        try {
            characteristics[char.name] = await service.getCharacteristic(char.uuid);
            log(`  ✓ ${char.name}`);
        } catch (e) {
            log(`  ✗ ${char.name}: ${e.message}`, 'error');
        }
    }
}

async function subscribeToNotifications() {
    log('Настройка уведомлений...');
    
    const notifyChars = ['currentTemp', 'currentHum', 'sysInfo'];
    
    for (const name of notifyChars) {
        const char = characteristics[name];
        if (char) {
            try {
                await char.startNotifications();
                char.addEventListener('characteristicvaluechanged', handleNotification);
                log(`  ✓ ${name} уведомления активированы`);
            } catch (e) {
                log(`  ✗ ${name}: ${e.message}`, 'error');
            }
        }
    }
}

// ==========================================================================
// ОБРАБОТКА ДАННЫХ
// ==========================================================================

function handleNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const data = decoder.decode(value);
    
    if (data.startsWith('T:')) {
        const temp = parseFloat(data.substring(2));
        tempValue.textContent = temp.toFixed(1);
    }
    else if (data.startsWith('H:')) {
        const hum = parseFloat(data.substring(2));
        humValue.textContent = hum.toFixed(1);
    }
    else if (data.startsWith('E:')) {
        const eff = parseFloat(data.substring(2));
        effValue.textContent = eff.toFixed(1);
    }
}

async function readAllSettings() {
    if (!characteristics.allSettings) return;
    
    try {
        log('📥 Чтение настроек...');
        const value = await characteristics.allSettings.readValue();
        const decoder = new TextDecoder('utf-8');
        const data = decoder.decode(value);
        
        log(`📊 Настройки: ${data}`);
        parseAndDisplaySettings(data);
        
    } catch (error) {
        log(`❌ Ошибка чтения настроек: ${error.message}`, 'error');
    }
}

function parseAndDisplaySettings(data) {
    if (!data || data.length === 0) {
        settingsContainer.innerHTML = '<div class="setting-item">Нет данных</div>';
        return;
    }
    
    const settings = {};
    const pairs = data.split(',');
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            settings[key] = value;
        }
    });
    
    // Отображаем целевую влажность
    if (settings.targetHumidity) {
        targetValue.textContent = settings.targetHumidity;
    }
    
    // Создаем HTML для настроек
    let html = '';
    
    // Основные настройки
    const mainSettings = [
        { key: 'targetHumidity', label: '🎯 Целевая влажность', unit: '%' },
        { key: 'lockHoldTime', label: '🔒 Время удержания замка', unit: 'мс' },
        { key: 'doorSoundEnabled', label: '🔊 Звук двери', unit: '', type: 'bool' },
        { key: 'waterHeaterEnabled', label: '🔥 Подогрев воды', unit: '', type: 'bool' },
        { key: 'waterHeaterMaxTemp', label: '🌡️ Макс. температура', unit: '°C' }
    ];
    
    mainSettings.forEach(setting => {
        if (settings[setting.key] !== undefined) {
            let value = settings[setting.key];
            if (setting.type === 'bool') {
                value = value === '1' ? 'ВКЛ' : 'ВЫКЛ';
            }
            
            html += `
                <div class="setting-item">
                    <span class="setting-label">${setting.label}</span>
                    <span class="setting-value">${value}${setting.unit}</span>
                </div>
            `;
        }
    });
    
    // Логика влажности
    const logicSettings = [
        { key: 'deadZonePercent', label: '📊 Мертвая зона', unit: '%' },
        { key: 'minHumidityChange', label: '📉 Мин. изменение', unit: '%' },
        { key: 'maxOperationDuration', label: '⏱️ Макс. время работы', unit: ' мин' },
        { key: 'operationCooldown', label: '⏳ Время отдыха', unit: ' мин' },
        { key: 'maxSafeHumidity', label: '🛡️ Макс. безопасная', unit: '%' },
        { key: 'resourceCheckDiff', label: '🔄 Порог ресурса', unit: '%' },
        { key: 'hysteresis', label: '📈 Гистерезис', unit: '%' },
        { key: 'lowFaultThreshold', label: '⚠️ Порог "Мало"', unit: '' },
        { key: 'emptyFaultThreshold', label: '⛔ Порог "Нет"', unit: '' }
    ];
    
    logicSettings.forEach(setting => {
        if (settings[setting.key] !== undefined) {
            html += `
                <div class="setting-item">
                    <span class="setting-label">${setting.label}</span>
                    <span class="setting-value">${settings[setting.key]}${setting.unit}</span>
                </div>
            `;
        }
    });
    
    // Таймауты
    const timeoutSettings = [
        { key: 'lockTimeIndex', label: '🔐 Таймаут блокировки', unit: '', 
          values: ['ОТКЛ', '30 сек', '1 мин', '2 мин', '5 мин'] },
        { key: 'menuTimeoutOptionIndex', label: '📱 Таймаут меню', unit: '',
          values: ['ОТКЛ', '15 сек', '30 сек', '1 мин', '2 мин'] },
        { key: 'screenTimeoutOptionIndex', label: '🖥️ Таймаут экрана', unit: '',
          values: ['ОТКЛ', '30 сек', '1 мин', '5 мин', '10 мин'] }
    ];
    
    timeoutSettings.forEach(setting => {
        if (settings[setting.key] !== undefined) {
            const index = parseInt(settings[setting.key]);
            const value = setting.values[index] || 'ОТКЛ';
            html += `
                <div class="setting-item">
                    <span class="setting-label">${setting.label}</span>
                    <span class="setting-value">${value}</span>
                </div>
            `;
        }
    });
    
    // Счетчики
    const counterSettings = [
        { key: 'rebootCounter', label: '🔄 Плановых перезагрузок', unit: '' },
        { key: 'wdtResetCount', label: '⚠️ Аварийных перезагрузок', unit: '' }
    ];
    
    counterSettings.forEach(setting => {
        if (settings[setting.key] !== undefined) {
            html += `
                <div class="setting-item">
                    <span class="setting-label">${setting.label}</span>
                    <span class="setting-value">${settings[setting.key]}</span>
                </div>
            `;
        }
    });
    
    settingsContainer.innerHTML = html;
}

// ==========================================================================
// УПРАВЛЕНИЕ K10 (ЗАМОК)
// ==========================================================================

async function sendK10Command() {
    if (!characteristics.targetHum) {
        log('❌ Характеристика не найдена', 'error');
        return;
    }
    
    try {
        k10Btn.classList.add('active');
        k10Btn.innerHTML = '<span>🔓</span><span>Открытие...</span>';
        
        // Отправляем специальную команду для K10
        // Можно использовать характеристику targetHum с специальным значением
        const encoder = new TextEncoder();
        await characteristics.targetHum.writeValue(encoder.encode('K10'));
        
        log('🔓 Команда K10 отправлена', 'success');
        
        setTimeout(() => {
            k10Btn.classList.remove('active');
            k10Btn.innerHTML = '<span>🔒</span><span>Управление замком (K10)</span>';
        }, 2000);
        
    } catch (error) {
        log(`❌ Ошибка отправки K10: ${error.message}`, 'error');
        k10Btn.classList.remove('active');
        k10Btn.innerHTML = '<span>🔒</span><span>Управление замком (K10)</span>';
    }
}

// ==========================================================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================================================

// Проверка поддержки Web Bluetooth
if (!navigator.bluetooth) {
    log('❌ Web Bluetooth не поддерживается в этом браузере!', 'error');
    updateStatus('❌ Браузер не поддерживается', false);
    connectBtn.disabled = true;
} else {
    log('✅ Web Bluetooth поддерживается');
}

// Обработчики кнопок
connectBtn.addEventListener('click', connectToDevice);
resetBtn.addEventListener('click', resetBLE);
k10Btn.addEventListener('click', sendK10Command);

// Инициализация статуса ресурсов
waterStatus.className = 'resource-status status-ok';
waterText.textContent = 'ОК';
silicaStatus.className = 'resource-status status-ok';
silicaText.textContent = 'ОК';

log('🚀 Интерфейс загружен');
