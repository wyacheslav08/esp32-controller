// ==========================================================================
// BLE Web Interface for Guitar Cabinet - Упрощенная версия
// ==========================================================================

// UUID сервиса и характеристик (ДОЛЖНЫ СОВПАДАТЬ С ESP32)
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
const dataPanel = document.getElementById('dataPanel');
const tempValue = document.getElementById('tempValue');
const humValue = document.getElementById('humValue');
const effValue = document.getElementById('effValue');
const debugLog = document.getElementById('debugLog');

// ==========================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================================================

function log(message, type = 'info') {
    console.log(`📱 ${message}`);
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    
    if (type === 'error') entry.style.color = '#ff6b6b';
    if (type === 'success') entry.style.color = '#69db7e';
    
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight;
}

function updateStatus(text, isConnected) {
    statusText.textContent = text;
    if (isConnected) {
        statusLed.classList.add('connected');
        connectBtn.textContent = '❌ Отключиться';
        connectBtn.classList.add('connected');
        dataPanel.style.display = 'block';
    } else {
        statusLed.classList.remove('connected');
        connectBtn.textContent = '🔌 Подключиться';
        connectBtn.classList.remove('connected');
        dataPanel.style.display = 'none';
    }
}

// ==========================================================================
// ПОДКЛЮЧЕНИЕ К BLE
// ==========================================================================

async function connectToDevice() {
    try {
        // Если уже подключены - отключаемся
        if (gattServer && gattServer.connected) {
            await disconnectFromDevice();
            return;
        }
        
        updateStatus('🔍 Поиск устройств...', false);
        connectBtn.disabled = true;
        
        log('Поиск устройств GuitarCabinet...');
        
        // Запрос устройства
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'GuitarCabinet' }
            ],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log(`✅ Найдено: ${bluetoothDevice.name}`);
        
        updateStatus('🔌 Подключение...', false);
        
        // Обработка отключения
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        // Подключение к GATT серверу
        gattServer = await bluetoothDevice.gatt.connect();
        log('✅ GATT сервер подключен');
        
        // Получение сервиса
        service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
        log('✅ Сервис найден');
        
        // Получение характеристик
        await discoverCharacteristics();
        
        // Подписка на уведомления
        await subscribeToNotifications();
        
        updateStatus('✅ Подключено', true);
        connectBtn.disabled = false;
        
        // Чтение начальных данных
        await readInitialData();
        
    } catch (error) {
        log(`❌ Ошибка: ${error.message}`, 'error');
        updateStatus('❌ Ошибка подключения', false);
        connectBtn.disabled = false;
    }
}

async function disconnectFromDevice() {
    if (gattServer && gattServer.connected) {
        gattServer.disconnect();
    }
    handleDisconnect();
}

function handleDisconnect() {
    log('❌ Устройство отключено', 'error');
    updateStatus('❌ Отключено', false);
    connectBtn.disabled = false;
    characteristics = {};
    gattServer = null;
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
                log(`  ✓ ${name} уведомления активированы`, 'success');
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
        tempValue.textContent = temp.toFixed(1) + '°C';
    }
    else if (data.startsWith('H:')) {
        const hum = parseFloat(data.substring(2));
        humValue.textContent = hum.toFixed(1) + '%';
    }
    else if (data.startsWith('E:')) {
        const eff = parseFloat(data.substring(2));
        effValue.textContent = eff.toFixed(1) + '%/мин';
    }
}

async function readInitialData() {
    log('📥 Чтение данных...');
    
    // Читаем температуру
    if (characteristics.currentTemp) {
        try {
            const value = await characteristics.currentTemp.readValue();
            const data = new TextDecoder().decode(value);
            if (data.startsWith('T:')) {
                tempValue.textContent = parseFloat(data.substring(2)).toFixed(1) + '°C';
            }
        } catch (e) {
            log(`Ошибка чтения температуры: ${e.message}`, 'error');
        }
    }
    
    // Читаем влажность
    if (characteristics.currentHum) {
        try {
            const value = await characteristics.currentHum.readValue();
            const data = new TextDecoder().decode(value);
            if (data.startsWith('H:')) {
                humValue.textContent = parseFloat(data.substring(2)).toFixed(1) + '%';
            }
        } catch (e) {
            log(`Ошибка чтения влажности: ${e.message}`, 'error');
        }
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

// Обработчик кнопки подключения
connectBtn.addEventListener('click', connectToDevice);

// Логируем запуск
log('🚀 Интерфейс загружен');
