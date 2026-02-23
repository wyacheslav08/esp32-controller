// ==========================================================================
// BLE Web Interface - С возможностью изменения настроек
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
let currentSettings = {}; // Храним текущие настройки

// Элементы DOM
const statusLed = document.getElementById('statusLed');
const statusText = document.getElementById('statusText');
const connectBtn = document.getElementById('connectBtn');
const resetBtn = document.getElementById('resetBtn');
const topMessage = document.getElementById('topMessage');
const targetDisplay = document.getElementById('targetDisplay');
const humIndicator = document.getElementById('humIndicator');
const ventIndicator = document.getElementById('ventIndicator');
const humidityInt = document.getElementById('humidityInt');
const humidityFrac = document.getElementById('humidityFrac');
const tempInt = document.getElementById('tempInt');
const tempFrac = document.getElementById('tempFrac');
const modeDisplay = document.getElementById('modeDisplay');
const settingsList = document.getElementById('settingsList');
const logContent = document.getElementById('logContent');

// Состояние
let currentMode = 'OFF';
let blinkState = false;

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

// Мигание индикаторов
setInterval(() => {
    blinkState = !blinkState;
    
    if (currentMode === 'HUMIDIFY') {
        humIndicator.style.opacity = blinkState ? '1' : '0.3';
    } else if (currentMode === 'DEHUMIDIFY') {
        humIndicator.style.opacity = blinkState ? '1' : '0.3';
    } else {
        humIndicator.style.opacity = '1';
    }
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
        const temp = parseFloat(data.substring(2));
        updateTemperature(temp);
    }
    else if (data.startsWith('H:')) {
        const hum = parseFloat(data.substring(2));
        updateHumidity(hum);
    }
    else if (data.startsWith('E:')) {
        // Эффективность (можно использовать позже)
    }
    else if (data.startsWith('MSG:')) {
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
// РАБОТА С НАСТРОЙКАМИ
// ==========================================================================

async function readAllSettings() {
    if (!characteristics.allSettings) return;
    
    try {
        log('📥 Чтение настроек...');
        const value = await characteristics.allSettings.readValue();
        const decoder = new TextDecoder('utf-8');
        const data = decoder.decode(value);
        
        // Парсим настройки
        parseSettings(data);
        displaySettingsList();
        
        log(`📊 Настройки получены`);
        
    } catch (error) {
        log(`❌ Ошибка чтения настроек: ${error.message}`, 'error');
    }
}

function parseSettings(data) {
    if (!data) return;
    
    const pairs = data.split(',');
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            currentSettings[key] = value;
        }
    });
    
    // Обновляем отображение цели
    if (currentSettings.targetHumidity) {
        targetDisplay.textContent = `Цель: ${currentSettings.targetHumidity}%`;
    }
}

// ==========================================================================
// ОТОБРАЖЕНИЕ СПИСКА НАСТРОЕК
// ==========================================================================

const menuItems = [
    { key: 'targetHumidity', name: 'ВЛАЖНОСТЬ (H%)', unit: '%', min: 0, max: 100, step: 1 },
    { key: 'lockTimeIndex', name: 'БЛОКИРОВКА', type: 'options', 
      options: ['ОТКЛ', '30 сек', '1 мин', '2 мин', '5 мин'] },
    { key: 'menuTimeoutOptionIndex', name: 'ТАЙМАУТ МЕНЮ', type: 'options',
      options: ['ОТКЛ', '15 сек', '30 сек', '1 мин', '2 мин'] },
    { key: 'screenTimeoutOptionIndex', name: 'ТАЙМАУТ ЭКРАНА', type: 'options',
      options: ['ОТКЛ', '30 сек', '1 мин', '5 мин', '10 мин'] },
    { key: 'lockHoldTime', name: 'ЗАМОК УДЕРЖАНИЕ', unit: 'мс', min: 100, max: 5000, step: 100 },
    { key: 'doorSoundEnabled', name: 'ЗВУК ДВЕРИ', type: 'boolean' },
    { key: 'waterSilicaSoundEnabled', name: 'ЗВУК РЕСУРСОВ', type: 'boolean' },
    { key: 'waterHeaterEnabled', name: 'ПОДОГРЕВ ВОДЫ', type: 'boolean' },
    { key: 'waterHeaterMaxTemp', name: 'ТЕМП. ПОДОГРЕВА', unit: '°C', min: 20, max: 40, step: 1 },
    { key: 'deadZonePercent', name: 'МЕРТВАЯ ЗОНА', unit: '%', min: 0, max: 10, step: 0.1 },
    { key: 'minHumidityChange', name: 'МИН. ИЗМЕНЕНИЕ', unit: '%', min: 0, max: 5, step: 0.1 },
    { key: 'maxOperationDuration', name: 'МАКС. ВРЕМЯ', unit: 'мин', min: 1, max: 10, step: 1 },
    { key: 'operationCooldown', name: 'ВРЕМЯ ОТДЫХА', unit: 'мин', min: 1, max: 5, step: 1 },
    { key: 'maxSafeHumidity', name: 'МАКС. БЕЗОПАСНАЯ', unit: '%', min: 50, max: 90, step: 1 },
    { key: 'resourceCheckDiff', name: 'ПОРОГ РЕСУРСА', unit: '%', min: 1, max: 10, step: 1 },
    { key: 'hysteresis', name: 'ГИСТЕРЕЗИС', unit: '%', min: 0, max: 5, step: 0.1 },
    { key: 'lowFaultThreshold', name: 'ПОРОГ "МАЛО"', min: 1, max: 10, step: 1 },
    { key: 'emptyFaultThreshold', name: 'ПОРОГ "НЕТ"', min: 1, max: 20, step: 1 }
];

function displaySettingsList() {
    let html = '';
    
    menuItems.forEach(item => {
        if (currentSettings[item.key] !== undefined) {
            const value = formatSettingValue(item, currentSettings[item.key]);
            
            html += `
                <div class="setting-row" onclick="editSetting('${item.key}')">
                    <span class="setting-name">${item.name}</span>
                    <span class="setting-value">${value}</span>
                </div>
            `;
        }
    });
    
    settingsList.innerHTML = html;
}

function formatSettingValue(item, value) {
    if (item.type === 'options') {
        const index = parseInt(value);
        return item.options[index] || 'ОТКЛ';
    }
    
    if (item.type === 'boolean') {
        return value === '1' ? 'ВКЛ' : 'ВЫКЛ';
    }
    
    if (item.unit) {
        return value + item.unit;
    }
    
    return value;
}

// ==========================================================================
// РЕДАКТИРОВАНИЕ НАСТРОЕК
// ==========================================================================

window.editSetting = function(key) {
    const item = menuItems.find(i => i.key === key);
    if (!item) return;
    
    const currentValue = currentSettings[key];
    
    let newValue;
    
    if (item.type === 'boolean') {
        // Переключаем ВКЛ/ВЫКЛ
        newValue = currentValue === '1' ? '0' : '1';
        sendSetting(key, newValue);
    }
    else if (item.type === 'options') {
        // Циклически переключаем опции
        const maxIndex = item.options.length - 1;
        let currentIndex = parseInt(currentValue) || 0;
        newValue = ((currentIndex + 1) > maxIndex) ? 0 : (currentIndex + 1);
        sendSetting(key, newValue.toString());
    }
    else {
        // Для числовых значений показываем промпт
        const promptText = `Введите значение для ${item.name} (${item.min} - ${item.max}):`;
        const input = prompt(promptText, currentValue);
        
        if (input !== null) {
            let numValue = parseFloat(input);
            
            // Проверяем диапазон
            if (!isNaN(numValue)) {
                if (numValue < item.min) numValue = item.min;
                if (numValue > item.max) numValue = item.max;
                
                // Для дробных значений с шагом 0.1
                if (item.step === 0.1) {
                    numValue = Math.round(numValue * 10) / 10;
                } else {
                    numValue = Math.round(numValue);
                }
                
                sendSetting(key, numValue.toString());
            }
        }
    }
}

async function sendSetting(key, value) {
    if (!characteristics.allSettings) {
        log('❌ Характеристика настроек не найдена', 'error');
        return;
    }
    
    try {
        // Обновляем значение в текущих настройках
        currentSettings[key] = value;
        
        // Формируем строку со всеми настройками
        let settingsString = '';
        for (const [k, v] of Object.entries(currentSettings)) {
            if (settingsString) settingsString += ',';
            settingsString += `${k}=${v}`;
        }
        
        // Отправляем на ESP32
        const encoder = new TextEncoder();
        await characteristics.allSettings.writeValue(encoder.encode(settingsString));
        
        log(`✅ Настройка ${key} = ${value} отправлена`, 'success');
        
        // Обновляем отображение
        displaySettingsList();
        
        // Если меняли целевую влажность, обновляем на экране
        if (key === 'targetHumidity') {
            targetDisplay.textContent = `Цель: ${value}%`;
        }
        
    } catch (error) {
        log(`❌ Ошибка отправки: ${error.message}`, 'error');
    }
}

// ==========================================================================
// ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================================================

// Функция для отправки команд на ESP32 (например, для K10)
async function sendCommand(command) {
    if (!characteristics.targetHum) {
        log('❌ Характеристика не найдена', 'error');
        return;
    }
    
    try {
        const encoder = new TextEncoder();
        await characteristics.targetHum.writeValue(encoder.encode(command));
        log(`📤 Команда отправлена: ${command}`, 'success');
    } catch (error) {
        log(`❌ Ошибка отправки команды: ${error.message}`, 'error');
    }
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
topMessage.textContent = 'ОЖИДАНИЕ...';
modeDisplay.textContent = 'РЕЖИМ: ОЖИДАНИЕ';
