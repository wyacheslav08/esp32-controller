// =========================================================================
// BLE Web Interface for Guitar Cabinet Controller
// =========================================================================

// UUID сервисов и характеристик (должны совпадать с ESP32)
const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_TARGET_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a1";
const BLE_CHAR_CURRENT_TEMP_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a2";
const BLE_CHAR_CURRENT_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a3";
const BLE_CHAR_ALL_SETTINGS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a4";
const BLE_CHAR_SYS_INFO_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a5";

// Глобальные переменные
let bluetoothDevice = null;
let gattServer = null;
let targetHumCharacteristic = null;
let currentTempCharacteristic = null;
let currentHumCharacteristic = null;
let allSettingsCharacteristic = null;
let sysInfoCharacteristic = null;

// Элементы DOM
const statusLed = document.querySelector('.status-led');
const statusText = document.getElementById('statusText');

// =========================================================================
// Функции подключения
// =========================================================================

/**
 * Подключение к BLE устройству
 */
async function connectToDevice() {
    try {
        updateStatus('Поиск устройства...', 'connecting');
        
        // Запрос устройства с нужным сервисом
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'GuitarCabinet' },
                { services: [BLE_SERVICE_UUID] }
            ],
            optionalServices: [BLE_SERVICE_UUID]
        });

        updateStatus('Подключение...', 'connecting');
        
        // Подключение к серверу GATT
        gattServer = await bluetoothDevice.gatt.connect();
        
        // Получение основного сервиса
        const service = await gattServer.getPrimaryService(BLE_SERVICE_UUID);
        
        // Получение всех характеристик
        targetHumCharacteristic = await service.getCharacteristic(BLE_CHAR_TARGET_HUM_UUID);
        currentTempCharacteristic = await service.getCharacteristic(BLE_CHAR_CURRENT_TEMP_UUID);
        currentHumCharacteristic = await service.getCharacteristic(BLE_CHAR_CURRENT_HUM_UUID);
        allSettingsCharacteristic = await service.getCharacteristic(BLE_CHAR_ALL_SETTINGS_UUID);
        sysInfoCharacteristic = await service.getCharacteristic(BLE_CHAR_SYS_INFO_UUID);
        
        // Подписка на уведомления
        await currentTempCharacteristic.startNotifications();
        await currentHumCharacteristic.startNotifications();
        await sysInfoCharacteristic.startNotifications();
        
        // Обработка входящих уведомлений
        currentTempCharacteristic.addEventListener('characteristicvaluechanged', 
            handleTempNotification);
        currentHumCharacteristic.addEventListener('characteristicvaluechanged', 
            handleHumNotification);
        sysInfoCharacteristic.addEventListener('characteristicvaluechanged', 
            handleSysInfoNotification);
        
        // Обработка отключения
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        updateStatus('✅ Подключено', 'connected');
        
        // Запрашиваем начальные данные
        await requestInitialData();
        
    } catch (error) {
        console.error('Ошибка подключения:', error);
        updateStatus('❌ Ошибка подключения', 'error');
    }
}

/**
 * Обновление статуса подключения
 */
function updateStatus(text, state) {
    statusText.textContent = text;
    
    // Обновляем классы для LED индикатора
    statusLed.classList.remove('status-led-connected');
    
    if (state === 'connected') {
        statusLed.classList.add('status-led-connected');
    }
}

/**
 * Обработка отключения устройства
 */
function handleDisconnect() {
    updateStatus('❌ Устройство отключено', 'disconnected');
    
    // Сбрасываем переменные
    gattServer = null;
    targetHumCharacteristic = null;
    currentTempCharacteristic = null;
    currentHumCharacteristic = null;
    allSettingsCharacteristic = null;
    sysInfoCharacteristic = null;
}

// =========================================================================
// Обработчики уведомлений
// =========================================================================

/**
 * Обработка уведомлений температуры
 */
function handleTempNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const data = decoder.decode(value);
    
    console.log('📊 Температура:', data);
    
    // Парсим формат "T:24.5"
    if (data.startsWith('T:')) {
        const temp = parseFloat(data.substring(2));
        updateTempDisplay(temp);
    }
}

/**
 * Обработка уведомлений влажности
 */
function handleHumNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const data = decoder.decode(value);
    
    console.log('📊 Влажность:', data);
    
    // Парсим формат "H:45.5"
    if (data.startsWith('H:')) {
        const hum = parseFloat(data.substring(2));
        updateHumDisplay(hum);
    }
}

/**
 * Обработка системных уведомлений
 */
function handleSysInfoNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const data = decoder.decode(value);
    
    console.log('ℹ️ Система:', data);
    
    // Парсим формат "E:0.5" (эффективность)
    if (data.startsWith('E:')) {
        const eff = parseFloat(data.substring(2));
        updateEfficiencyDisplay(eff);
    } else if (data === 'ping') {
        console.log('📶 Pong');
    }
}

// =========================================================================
// Функции обновления интерфейса
// =========================================================================

/**
 * Обновление отображения температуры
 */
function updateTempDisplay(temp) {
    // Создаем или обновляем элемент температуры
    let tempElement = document.getElementById('temp-display');
    
    if (!tempElement) {
        tempElement = document.createElement('div');
        tempElement.id = 'temp-display';
        tempElement.className = 'sensor-card';
        document.querySelector('.container').appendChild(tempElement);
    }
    
    tempElement.innerHTML = `
        <div class="sensor-label">🌡️ Температура</div>
        <div class="sensor-value">${temp.toFixed(1)}°C</div>
    `;
}

/**
 * Обновление отображения влажности
 */
function updateHumDisplay(hum) {
    let humElement = document.getElementById('hum-display');
    
    if (!humElement) {
        humElement = document.createElement('div');
        humElement.id = 'hum-display';
        humElement.className = 'sensor-card';
        document.querySelector('.container').appendChild(humElement);
    }
    
    humElement.innerHTML = `
        <div class="sensor-label">💧 Влажность</div>
        <div class="sensor-value">${hum.toFixed(1)}%</div>
    `;
}

/**
 * Обновление отображения эффективности
 */
function updateEfficiencyDisplay(eff) {
    let effElement = document.getElementById('eff-display');
    
    if (!effElement) {
        effElement = document.createElement('div');
        effElement.id = 'eff-display';
        effElement.className = 'sensor-card';
        document.querySelector('.container').appendChild(effElement);
    }
    
    effElement.innerHTML = `
        <div class="sensor-label">⚡ Эффективность</div>
        <div class="sensor-value">${eff.toFixed(1)}%/мин</div>
    `;
}

// =========================================================================
// Функции записи данных
// =========================================================================

/**
 * Установка целевой влажности
 */
async function setTargetHumidity(value) {
    if (!targetHumCharacteristic) {
        alert('Сначала подключитесь к устройству');
        return;
    }
    
    try {
        const encoder = new TextEncoder();
        await targetHumCharacteristic.writeValue(encoder.encode(value.toString()));
        console.log('✅ Целевая влажность установлена:', value);
    } catch (error) {
        console.error('Ошибка записи:', error);
    }
}

/**
 * Запрос начальных данных
 */
async function requestInitialData() {
    if (!allSettingsCharacteristic) return;
    
    try {
        const value = await allSettingsCharacteristic.readValue();
        const decoder = new TextDecoder('utf-8');
        const data = decoder.decode(value);
        
        console.log('📥 Настройки:', data);
        
        // Парсим настройки
        parseAndDisplaySettings(data);
    } catch (error) {
        console.error('Ошибка чтения настроек:', error);
    }
}

/**
 * Парсинг и отображение настроек
 */
function parseAndDisplaySettings(data) {
    // Создаем секцию настроек, если её нет
    let settingsElement = document.getElementById('settings-display');
    
    if (!settingsElement) {
        settingsElement = document.createElement('div');
        settingsElement.id = 'settings-display';
        settingsElement.className = 'settings-card';
        document.querySelector('.container').appendChild(settingsElement);
    }
    
    // Парсим строку формата "key1=value1,key2=value2"
    const settings = {};
    const pairs = data.split(',');
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            settings[key] = value;
        }
    });
    
    // Создаем HTML для настроек
    let html = '<h2>⚙️ Настройки</h2>';
    
    if (settings.targetHumidity) {
        html += `
            <div class="setting-item">
                <label>Целевая влажность:</label>
                <input type="range" id="target-hum-slider" min="0" max="100" value="${settings.targetHumidity}">
                <span id="target-hum-value">${settings.targetHumidity}%</span>
            </div>
        `;
    }
    
    if (settings.lockHoldTime) {
        html += `
            <div class="setting-item">
                <label>Время удержания замка:</label>
                <span>${settings.lockHoldTime} мс</span>
            </div>
        `;
    }
    
    if (settings.waterHeaterEnabled !== undefined) {
        html += `
            <div class="setting-item">
                <label>Подогрев воды:</label>
                <span>${settings.waterHeaterEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ'}</span>
            </div>
        `;
    }
    
    settingsElement.innerHTML = html;
    
    // Добавляем обработчик для слайдера
    const slider = document.getElementById('target-hum-slider');
    if (slider) {
        const valueSpan = document.getElementById('target-hum-value');
        
        slider.addEventListener('input', (e) => {
            valueSpan.textContent = e.target.value + '%';
        });
        
        slider.addEventListener('change', (e) => {
            setTargetHumidity(e.target.value);
        });
    }
}

// =========================================================================
// Добавление кнопки подключения в HTML
// =========================================================================

// Добавляем стили для новых элементов
const styles = `
    .sensor-card {
        background: #f8f9fa;
        border-radius: 10px;
        padding: 15px;
        margin: 10px 0;
        text-align: center;
    }
    .sensor-label {
        font-size: 14px;
        color: #666;
        margin-bottom: 5px;
    }
    .sensor-value {
        font-size: 24px;
        font-weight: bold;
        color: #333;
    }
    .settings-card {
        background: white;
        border-radius: 10px;
        padding: 15px;
        margin-top: 20px;
    }
    .setting-item {
        margin: 15px 0;
        padding: 10px;
        background: #f8f9fa;
        border-radius: 8px;
    }
    .setting-item label {
        display: block;
        margin-bottom: 5px;
        color: #555;
    }
    .setting-item input[type="range"] {
        width: 100%;
        margin: 5px 0;
    }
    .connect-btn {
        background: #4caf50;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 25px;
        font-size: 16px;
        cursor: pointer;
        width: 100%;
        margin: 20px 0;
        transition: background 0.3s;
    }
    .connect-btn:hover {
        background: #45a049;
    }
    .connect-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
    }
`;

// Добавляем стили в head
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

// Добавляем кнопку подключения
const connectButton = document.createElement('button');
connectButton.className = 'connect-btn';
connectButton.textContent = '🔌 Подключиться к устройству';
connectButton.onclick = connectToDevice;

// Вставляем кнопку после статуса
const container = document.querySelector('.container');
container.insertBefore(connectButton, document.querySelector('.status').nextSibling);

console.log('🚀 BLE Web Interface готов к работе');
