// ==========================================================================
// BLE Web Interface - Точная копия экрана ESP32
// ==========================================================================

// UUID (как в ESP32)
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
const statusLed = document.getElementById('statusLed');
const statusText = document.getElementById('statusText');
const connectBtn = document.getElementById('connectBtn');
const resetBtn = document.getElementById('resetBtn');
const topMessage = document.getElementById('topMessage');
const humIndicator = document.getElementById('humIndicator');
const ventIndicator = document.getElementById('ventIndicator');
const heaterIndicator = document.getElementById('heaterIndicator');
const humidityInt = document.getElementById('humidityInt');
const humidityFrac = document.getElementById('humidityFrac');
const tempInt = document.getElementById('tempInt');
const tempFrac = document.getElementById('tempFrac');
const targetDisplay = document.getElementById('targetDisplay');
const modeIndicator = document.getElementById('modeIndicator');
const settingsList = document.getElementById('settingsList');
const logContent = document.getElementById('logContent');

// Состояние
let currentMode = 'OFF';
let blinkState = false;
let targetHumidity = 50;

// ==========================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================================================

function log(message, type = 'info') {
    console.log(`📱 ${message}`);
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    
    const time = new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    entry.textContent = `[${time}] ${message}`;
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
}

function updateConnectionStatus(connected) {
    if (connected) {
        statusLed.classList.add('connected');
        statusText.textContent = 'ON';
        connectBtn.textContent = 'ОТКЛЮЧИТЬСЯ';
        connectBtn.classList.add('connected');
    } else {
        statusLed.classList.remove('connected');
        statusText.textContent = 'OFF';
        connectBtn.textContent = 'ПОДКЛЮЧИТЬСЯ';
        connectBtn.classList.remove('connected');
    }
}

// Мигание индикаторов (как на ESP32)
setInterval(() => {
    blinkState = !blinkState;
    
    // Мигание H% при работе
    if (currentMode === 'HUMIDIFY') {
        humIndicator.style.opacity = blinkState ? '1' : '0.3';
    } else if (currentMode === 'DEHUMIDIFY') {
        humIndicator.style.opacity = blinkState ? '1' : '0.3';
    } else {
        humIndicator.style.opacity = '1';
    }
    
    // Мигание C' при работе вентиляции
    // (будет обновляться из данных)
    
    // Мигание T+ при работе подогрева
    // (будет обновляться из данных)
    
}, 500);

// ==========================================================================
// BLE ПОДКЛЮЧЕНИЕ
// ==========================================================================

async function connectToDevice() {
    try {
        if (gattServer && gattServer.connected) {
            await disconnectFromDevice();
            return;
        }
        
        log('🔍 Поиск устройств GuitarCabinet...');
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'GuitarCabinet' }
            ],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log(`✅ Найдено: ${bluetoothDevice.name}`);
        
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        gattServer = await bluetoothDevice.gatt.connect();
        log('✅ GATT сервер подключен');
        
        service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
        log('✅ Сервис найден');
        
        await discoverCharacteristics();
        await subscribeToNotifications();
        
        updateConnectionStatus(true);
        
        // Читаем начальные данные
        await readAllSettings();
        await readCurrentData();
        
    } catch (error) {
        log(`❌ Ошибка: ${error.message}`, 'error');
        updateConnectionStatus(false);
    }
}

async function disconnectFromDevice() {
    if (gattServer && gattServer.connected) {
        gattServer.disconnect();
    }
}

function handleDisconnect() {
    log('❌ Устройство отключено', 'error');
    updateConnectionStatus(false);
    characteristics = {};
    gattServer = null;
}

async function resetBLE() {
    log('🔄 Сброс BLE...');
    
    if (gattServer && gattServer.connected) {
        await disconnectFromDevice();
    }
    
    setTimeout(() => {
        connectToDevice();
    }, 1000);
}

async function discoverCharacteristics() {
    log('🔍 Поиск характеристик...');
    
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
    log('📡 Настройка уведомлений...');
    
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
        // Температура: "T:24.5"
        const temp = parseFloat(data.substring(2));
        updateTemperature(temp);
    }
    else if (data.startsWith('H:')) {
        // Влажность: "H:45.5"
        const hum = parseFloat(data.substring(2));
        updateHumidity(hum);
    }
    else if (data.startsWith('E:')) {
        // Эффективность: "E:0.5"
        const eff = parseFloat(data.substring(2));
        // Можно использовать для чего-то
    }
    else if (data.startsWith('MSG:')) {
        // Сообщение: "MSG:Дверь открыта"
        topMessage.textContent = data.substring(4);
    }
}

function updateTemperature(temp) {
    const intPart = Math.floor(temp);
    const fracPart = Math.floor((temp - intPart) * 10);
    
    tempInt.textContent = intPart;
    tempFrac.textContent = `.${fracPart}`;
}

function updateHumidity(hum) {
    const intPart = Math.floor(hum);
    const fracPart = Math.floor((hum - intPart) * 10);
    
    humidityInt.textContent = intPart;
    humidityFrac.textContent = `.${fracPart}`;
}

async function readCurrentData() {
    if (characteristics.currentTemp) {
        try {
            const value = await characteristics.currentTemp.readValue();
            const data = new TextDecoder().decode(value);
            if (data.startsWith('T:')) {
                updateTemperature(parseFloat(data.substring(2)));
            }
        } catch (e) {}
    }
    
    if (characteristics.currentHum) {
        try {
            const value = await characteristics.currentHum.readValue();
            const data = new TextDecoder().decode(value);
            if (data.startsWith('H:')) {
                updateHumidity(parseFloat(data.substring(2)));
            }
        } catch (e) {}
    }
}

// ==========================================================================
// НАСТРОЙКИ
// ==========================================================================

async function readAllSettings() {
    if (!characteristics.allSettings) return;
    
    try {
        log('📥 Чтение настроек...');
        const value = await characteristics.allSettings.readValue();
        const decoder = new TextDecoder('utf-8');
        const data = decoder.decode(value);
        
        log(`📊 Настройки получены`);
        parseAndDisplaySettings(data);
        
    } catch (error) {
        log(`❌ Ошибка чтения настроек: ${error.message}`, 'error');
    }
}

function parseAndDisplaySettings(data) {
    if (!data) return;
    
    const settings = {};
    const pairs = data.split(',');
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            settings[key] = value;
        }
    });
    
    // Обновляем целевую влажность
    if (settings.targetHumidity) {
        targetHumidity = parseInt(settings.targetHumidity);
        targetDisplay.textContent = `Цель: ${targetHumidity}%`;
    }
    
    // Список настроек для отображения (как в меню ESP32)
    const menuItems = [
        { key: 'targetHumidity', name: 'ВЛАЖНОСТЬ (H%)', value: settings.targetHumidity + '%' },
        { key: 'lockTimeIndex', name: 'БЛОКИРОВКА', value: getLockTimeName(settings.lockTimeIndex) },
        { key: 'menuTimeoutOptionIndex', name: 'ТАЙМАУТ МЕНЮ', value: getMenuTimeoutName(settings.menuTimeoutOptionIndex) },
        { key: 'screenTimeoutOptionIndex', name: 'ТАЙМАУТ ЭКРАНА', value: getScreenTimeoutName(settings.screenTimeoutOptionIndex) },
        { key: 'lockHoldTime', name: 'ЗАМОК УДЕРЖАНИЕ', value: settings.lockHoldTime + 'мс' },
        { key: 'doorSoundEnabled', name: 'ЗВУК ДВЕРИ', value: settings.doorSoundEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ' },
        { key: 'waterHeaterEnabled', name: 'ПОДОГРЕВ ВОДЫ', value: settings.waterHeaterEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ' },
        { key: 'deadZonePercent', name: 'МЕРТВАЯ ЗОНА', value: settings.deadZonePercent + '%' },
        { key: 'hysteresis', name: 'ГИСТЕРЕЗИС', value: settings.hysteresis + '%' },
        { key: 'maxSafeHumidity', name: 'МАКС. БЕЗОПАСНАЯ', value: settings.maxSafeHumidity + '%' }
    ];
    
    let html = '';
    menuItems.forEach(item => {
        if (settings[item.key] !== undefined) {
            html += `
                <div class="setting-row" onclick="selectSetting('${item.key}')">
                    <span class="setting-name">${item.name}</span>
                    <span class="setting-value">${item.value}</span>
                </div>
            `;
        }
    });
    
    settingsList.innerHTML = html;
}

function getLockTimeName(index) {
    const names = ['ОТКЛ', '30 сек', '1 мин', '2 мин', '5 мин'];
    return names[parseInt(index)] || 'ОТКЛ';
}

function getMenuTimeoutName(index) {
    const names = ['ОТКЛ', '15 сек', '30 сек', '1 мин', '2 мин'];
    return names[parseInt(index)] || '15 сек';
}

function getScreenTimeoutName(index) {
    const names = ['ОТКЛ', '30 сек', '1 мин', '5 мин', '10 мин'];
    return names[parseInt(index)] || 'ОТКЛ';
}

// Функция для выбора настройки (будет отправлять команду на ESP32)
window.selectSetting = function(settingKey) {
    log(`🖱️ Выбрана настройка: ${settingKey}`);
    // Здесь можно добавить отправку команды на ESP32
}

// ==========================================================================
// УПРАВЛЕНИЕ ЛОГОМ
// ==========================================================================

window.toggleLog = function() {
    const log = document.getElementById('logContent');
    const toggle = document.getElementById('logToggle');
    
    if (log.style.display === 'none') {
        log.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        log.style.display = 'none';
        toggle.textContent = '▶';
    }
}

// ==========================================================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================================================

// Проверка поддержки Web Bluetooth
if (!navigator.bluetooth) {
    log('❌ Web Bluetooth не поддерживается!', 'error');
    connectBtn.disabled = true;
} else {
    log('✅ Web Bluetooth поддерживается');
    log('🔄 Ожидание подключения...');
}

// Обработчики кнопок
connectBtn.addEventListener('click', connectToDevice);
resetBtn.addEventListener('click', resetBLE);

// Инициализация экрана
updateConnectionStatus(false);
humidityInt.textContent = '--';
tempInt.textContent = '--';
topMessage.textContent = 'ОЖИДАНИЕ ПОДКЛЮЧЕНИЯ...';
