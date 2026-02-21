// index.js - ПОЛНАЯ ИСПРАВЛЕННАЯ ВЕРСИЯ

// --- UUID сервисов и характеристик (должны совпадать с ESP32) ---
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_CHAR_TEMP_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a2';
const BLE_CHAR_HUM_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a3';
const BLE_CHAR_SYS_INFO_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a5';

// --- Глобальные переменные ---
let device = null;
let server = null;
let service = null;
let tempChar = null;
let humChar = null;
let sysInfoChar = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let pollingInterval = null;

// --- DOM элементы ---
let statusLed, statusText, tempValue, humValue, effValue, logDiv;

// --- Функция создания интерфейса ---
function createUI() {
    const container = document.querySelector('.container');
    if (!container) return;
    
    // Очищаем контейнер
    container.innerHTML = '';
    
    // Заголовок
    const title = document.createElement('h1');
    title.textContent = '🎸 Guitar Cabinet Controller';
    container.appendChild(title);
    
    // Статус
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.style.cssText = `
        background: #e3f2fd;
        padding: 15px;
        border-radius: 10px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    
    statusLed = document.createElement('div');
    statusLed.className = 'status-led';
    statusLed.style.cssText = `
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #f44336;
        transition: background 0.3s;
    `;
    
    statusText = document.createElement('span');
    statusText.id = 'statusText';
    statusText.textContent = 'Ожидание подключения...';
    statusText.style.flex = '1';
    
    statusDiv.appendChild(statusLed);
    statusDiv.appendChild(statusText);
    container.appendChild(statusDiv);
    
    // Панель датчиков
    const sensorsDiv = document.createElement('div');
    sensorsDiv.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 15px;
        margin-bottom: 20px;
    `;
    
    // Температура
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = `
        background: #f8f9fa;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
    `;
    tempDiv.innerHTML = `
        <div style="color: #666; font-size: 14px; margin-bottom: 5px;">Температура</div>
        <div style="font-size: 32px; font-weight: bold; color: #2196f3;">
            <span id="tempValue">--</span>°C
        </div>
    `;
    
    // Влажность
    const humDiv = document.createElement('div');
    humDiv.style.cssText = `
        background: #f8f9fa;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
    `;
    humDiv.innerHTML = `
        <div style="color: #666; font-size: 14px; margin-bottom: 5px;">Влажность</div>
        <div style="font-size: 32px; font-weight: bold; color: #4caf50;">
            <span id="humValue">--</span>%
        </div>
    `;
    
    // Эффективность
    const effDiv = document.createElement('div');
    effDiv.style.cssText = `
        grid-column: span 2;
        background: #fff3e0;
        padding: 15px;
        border-radius: 10px;
        text-align: center;
    `;
    effDiv.innerHTML = `
        <div style="color: #666; font-size: 14px; margin-bottom: 5px;">Эффективность</div>
        <div style="font-size: 24px; font-weight: bold; color: #ff9800;">
            <span id="effValue">--</span>%/мин
        </div>
    `;
    
    sensorsDiv.appendChild(tempDiv);
    sensorsDiv.appendChild(humDiv);
    sensorsDiv.appendChild(effDiv);
    container.appendChild(sensorsDiv);
    
    // Лог
    logDiv = document.createElement('div');
    logDiv.id = 'log';
    logDiv.style.cssText = `
        margin-top: 20px;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 5px;
        font-family: monospace;
        font-size: 12px;
        max-height: 150px;
        overflow-y: auto;
        border: 1px solid #ddd;
        margin-bottom: 20px;
    `;
    container.appendChild(logDiv);
    
    // Кнопка подключения
    const connectBtn = document.createElement('button');
    connectBtn.id = 'connectBtn';
    connectBtn.textContent = '🔌 Подключиться к устройству';
    connectBtn.style.cssText = `
        background: #4caf50;
        color: white;
        border: none;
        padding: 15px 30px;
        border-radius: 10px;
        font-size: 16px;
        cursor: pointer;
        width: 100%;
        transition: background 0.3s;
    `;
    // И добавьте кнопку в createUI():
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '🔄 Сброс Bluetooth';
    resetBtn.style.cssText = `
        background: #ff9800;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        font-size: 14px;
        cursor: pointer;
        width: 100%;
        margin-top: 10px;
        transition: background 0.3s;
    `;
    resetBtn.onmouseover = () => { resetBtn.style.background = '#f57c00'; };
    resetBtn.onmouseout = () => { resetBtn.style.background = '#ff9800'; };
    resetBtn.onclick = resetBluetooth;
    container.appendChild(resetBtn);

    connectBtn.onmouseover = () => { connectBtn.style.background = '#45a049'; };
    connectBtn.onmouseout = () => { connectBtn.style.background = '#4caf50'; };
    connectBtn.onclick = connect;
    container.appendChild(connectBtn);
    
    // Получаем ссылки на элементы
    tempValue = document.getElementById('tempValue');
    humValue = document.getElementById('humValue');
    effValue = document.getElementById('effValue');
}

// Добавьте эту функцию
function resetBluetooth() {
    if (device) {
        device.gatt.disconnect();
        device = null;
        server = null;
    }
    updateConnectionStatus(false);
    log('🔄 Bluetooth сброшен. Попробуйте подключиться заново.');
}

// --- Функция логирования ---
function log(message) {
    const timestamp = new Date().toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    });
    const logMessage = `${timestamp}: ${message}`;
    console.log(logMessage);
    
    if (logDiv) {
        logDiv.innerHTML += logMessage + '<br>';
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// --- Обновление статуса подключения ---
function updateConnectionStatus(connected) {
    if (!statusLed || !statusText) return;
    
    if (connected) {
        statusLed.style.background = '#4caf50';
        statusLed.style.animation = 'pulse 2s infinite';
        statusText.textContent = 'Подключено';
        statusText.style.color = '#000000';
        log('✅ Подключено к устройству');
        
        // Скрываем кнопку
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) connectBtn.style.display = 'none';
    } else {
        statusLed.style.background = '#f44336';
        statusLed.style.animation = 'none';
        statusText.textContent = 'Отключено';
        statusText.style.color = '#000000';
        log('❌ Отключено');
        
        // Показываем кнопку
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) connectBtn.style.display = 'block';
        
        // Очищаем значения при реальном отключении
        if (tempValue) tempValue.textContent = '--';
        if (humValue) humValue.textContent = '--';
        if (effValue) effValue.textContent = '--';
        
        // Останавливаем опрос
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }
}

// --- Обработчики данных ---
function handleTempUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    const numStr = value.replace('T:', '');
    const temp = parseFloat(numStr);
    if (!isNaN(temp) && tempValue) {
        tempValue.textContent = temp.toFixed(1);
        log(`🌡️ Температура: ${temp.toFixed(1)}°C`);
    }
}

function handleHumUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    const numStr = value.replace('H:', '');
    const hum = parseFloat(numStr);
    if (!isNaN(hum) && humValue) {
        humValue.textContent = hum.toFixed(1);
        log(`💧 Влажность: ${hum.toFixed(1)}%`);
    }
}

function handleSysInfoUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    if (value.startsWith('E:') || value.startsWith('eff:')) {
        const numStr = value.replace('E:', '').replace('eff:', '');
        const eff = parseFloat(numStr);
        if (!isNaN(eff) && effValue) {
            effValue.textContent = eff.toFixed(1);
            log(`📈 Эффективность: ${eff.toFixed(1)}%/мин`);
        }
    }
    // Игнорируем пинги и другие сообщения
}

// --- Функция чтения всех характеристик ---
async function readAllCharacteristics() {
    if (!device || !device.gatt.connected) return;
    
    try {
        const temp = await tempChar.readValue();
        const hum = await humChar.readValue();
        const sys = await sysInfoChar.readValue();
        
        handleTempUpdate({ target: { value: temp } });
        handleHumUpdate({ target: { value: hum } });
        handleSysInfoUpdate({ target: { value: sys } });
    } catch (e) {
        // Игнорируем ошибки чтения - они могут возникать, если соединение прервалось
    }
}

// --- Обработчик отключения ---
function onDisconnected() {
    log('❌ Устройство отключилось');
    updateConnectionStatus(false);
    device = null;
    server = null;
}

// Добавьте эту функцию перед connect()
async function forgetDevice() {
    if (device) {
        try {
            log('🔄 Принудительное забывание устройства...');
            if (device.gatt.connected) {
                await device.gatt.disconnect();
            }
            // Забываем устройство (работает не во всех браузерах)
            if (device.forget) {
                await device.forget();
                log('✅ Устройство забыто');
            }
        } catch (e) {
            log('⚠️ Не удалось забыть устройство: ' + e.message);
        }
        device = null;
        server = null;
    }
}

// Измените начало функции connect():
async function connect() {
    try {
        // Сначала забываем старое устройство
        await forgetDevice();
        
        log('🔍 Поиск устройств...');
        // ... остальной код
    }
}

// --- Основная функция подключения ---
async function connect() {
    try {
        log('🔍 Поиск устройств...');
        if (statusText) statusText.textContent = 'Поиск...';
        
        device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'GuitarCabinet' }],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log('✅ Найдено: ' + device.name);
        if (statusText) statusText.textContent = 'Найдено: ' + device.name;

        device.addEventListener('gattserverdisconnected', onDisconnected);

        log('🔌 Подключение...');
        if (statusText) statusText.textContent = 'Подключение...';
        server = await device.gatt.connect();

        log('📡 Получение сервиса...');
        service = await server.getPrimaryService(BLE_SERVICE_UUID);

        log('📊 Получение характеристик...');
        tempChar = await service.getCharacteristic(BLE_CHAR_TEMP_UUID);
        humChar = await service.getCharacteristic(BLE_CHAR_HUM_UUID);
        sysInfoChar = await service.getCharacteristic(BLE_CHAR_SYS_INFO_UUID);

        // ========== ИСПРАВЛЕННАЯ ОБРАБОТКА ОШИБОК ==========
        log('📨 Настройка уведомлений...');
        
        // Пытаемся включить уведомления для температуры
        try {
            await tempChar.startNotifications();
            tempChar.addEventListener('characteristicvaluechanged', handleTempUpdate);
            log('✅ Уведомления температуры включены');
        } catch (e) {
            log('⚠️ Уведомления температуры не поддерживаются, данные будем читать вручную');
        }
        
        // Пытаемся включить уведомления для влажности
        try {
            await humChar.startNotifications();
            humChar.addEventListener('characteristicvaluechanged', handleHumUpdate);
            log('✅ Уведомления влажности включены');
        } catch (e) {
            log('⚠️ Уведомления влажности не поддерживаются, данные будем читать вручную');
        }
        
        // Пытаемся включить уведомления для системы
        try {
            await sysInfoChar.startNotifications();
            sysInfoChar.addEventListener('characteristicvaluechanged', handleSysInfoUpdate);
            log('✅ Уведомления системы включены');
        } catch (e) {
            log('⚠️ Уведомления системы не поддерживаются');
        }

        // Читаем начальные значения
        log('📖 Чтение начальных значений...');
        await readAllCharacteristics();

        // Запускаем периодическое чтение (каждые 2 секунды) как запасной вариант
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(readAllCharacteristics, 2000);
        log('🔄 Запущен резервный опрос данных (каждые 2 сек)');

        // Устанавливаем статус подключения
        updateConnectionStatus(true);
        reconnectAttempts = 0;

    } catch (error) {
        log('❌ Ошибка подключения: ' + error.message);
        if (statusText) statusText.textContent = 'Ошибка: ' + error.message;
        
        // Если устройство было подключено, но ошибка в настройке, не сбрасываем статус сразу
        if (device && device.gatt.connected) {
            log('⚠️ Устройство подключено, но есть проблемы с настройкой');
            // Пытаемся хотя бы читать данные
            try {
                await readAllCharacteristics();
                updateConnectionStatus(true);
            } catch (e) {
                updateConnectionStatus(false);
            }
        } else {
            updateConnectionStatus(false);
            
            // Пробуем переподключиться
            reconnectAttempts++;
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                log(`🔄 Попытка переподключения ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
                setTimeout(connect, 2000);
            }
        }
    }
}

// --- Инициализация при загрузке ---
window.addEventListener('load', () => {
    // Создаем интерфейс
    createUI();
    
    // Добавляем анимацию пульсации
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    log('✅ Страница загружена. Нажмите кнопку для подключения.');
});

// --- Проверка поддержки Web Bluetooth ---
if (!navigator.bluetooth) {
    log('❌ Web Bluetooth не поддерживается в этом браузере');
    if (statusText) statusText.textContent = 'Web Bluetooth не поддерживается';
}
