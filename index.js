// index.js - ИСПРАВЛЕННАЯ ВЕРСИЯ

// UUID сервисов и характеристик
const BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const BLE_CHAR_TEMP_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a2';
const BLE_CHAR_HUM_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a3';
const BLE_CHAR_SYS_INFO_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a5';

let device = null;
let server = null;
let service = null;
let tempChar = null;
let humChar = null;
let sysInfoChar = null;

// DOM элементы
const statusLed = document.querySelector('.status-led');
const statusText = document.getElementById('statusText');
const tempSpan = document.getElementById('tempValue');
const humSpan = document.getElementById('humValue');
const effSpan = document.getElementById('effValue');

// Функция логирования
function log(message) {
    console.log(message);
    const logDiv = document.getElementById('log');
    if (logDiv) {
        logDiv.innerHTML += new Date().toLocaleTimeString() + ': ' + message + '<br>';
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

// Обновление статуса подключения
function updateConnectionStatus(connected) {
    if (connected) {
        statusLed.className = 'status-led status-led-connected';
        statusText.textContent = 'Подключено';
        log('✅ Подключено к устройству');
    } else {
        statusLed.className = 'status-led';
        statusText.textContent = 'Отключено';
        log('❌ Отключено');
        
        // Показываем кнопку подключения снова
        const connectBtn = document.querySelector('.connect-btn');
        if (connectBtn) connectBtn.style.display = 'block';
    }
}

// Обработка отключения
function onDisconnected() {
    updateConnectionStatus(false);
    device = null;
    server = null;
    
    // Очищаем значения
    if (tempSpan) tempSpan.textContent = '--';
    if (humSpan) humSpan.textContent = '--';
    if (effSpan) effSpan.textContent = '--';
}

// Подключение к устройству
async function connect() {
    try {
        log('🔍 Поиск устройств...');
        statusText.textContent = 'Поиск...';
        
        device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'GuitarCabinet' }],
            optionalServices: [BLE_SERVICE_UUID]
        });

        log('✅ Найдено: ' + device.name);
        statusText.textContent = 'Найдено: ' + device.name;

        device.addEventListener('gattserverdisconnected', onDisconnected);

        log('🔌 Подключение...');
        statusText.textContent = 'Подключение...';
        server = await device.gatt.connect();
        
        log('📡 Получение сервиса...');
        service = await server.getPrimaryService(BLE_SERVICE_UUID);

        log('📊 Получение характеристик...');
        tempChar = await service.getCharacteristic(BLE_CHAR_TEMP_UUID);
        humChar = await service.getCharacteristic(BLE_CHAR_HUM_UUID);
        sysInfoChar = await service.getCharacteristic(BLE_CHAR_SYS_INFO_UUID);

        // ВАЖНО: сначала читаем начальные значения
        const tempValue = await tempChar.readValue();
        const humValue = await humChar.readValue();
        const sysValue = await sysInfoChar.readValue();
        
        handleTempUpdate({ target: { value: tempValue } });
        handleHumUpdate({ target: { value: humValue } });
        handleSysInfoUpdate({ target: { value: sysValue } });

        // Затем включаем уведомления
        log('📨 Включение уведомлений...');
        
        await tempChar.startNotifications();
        tempChar.addEventListener('characteristicvaluechanged', handleTempUpdate);
        log('✅ Уведомления температуры включены');

        await humChar.startNotifications();
        humChar.addEventListener('characteristicvaluechanged', handleHumUpdate);
        log('✅ Уведомления влажности включены');

        await sysInfoChar.startNotifications();
        sysInfoChar.addEventListener('characteristicvaluechanged', handleSysInfoUpdate);
        log('✅ Уведомления системы включены');

        updateConnectionStatus(true);
        
        // Скрываем кнопку подключения
        const connectBtn = document.querySelector('.connect-btn');
        if (connectBtn) connectBtn.style.display = 'none';

        // Периодически читаем значения для надежности (раз в 5 секунд)
        // В функции connect после получения характеристик:

        // НЕ включаем уведомления, просто читаем данные раз в секунду
        setInterval(async () => {
            if (device && device.gatt.connected) {
                try {
                    const tempValue = await tempChar.readValue();
                    const humValue = await humChar.readValue();
                    const sysValue = await sysInfoChar.readValue();
            
                    handleTempUpdate({ target: { value: tempValue } });
                    handleHumUpdate({ target: { value: humValue } });
                    handleSysInfoUpdate({ target: { value: sysValue } });
                } catch (e) {
                 console.log('Ошибка чтения:', e);
                }
            }
        }, 1000);

    } catch (error) {
        log('❌ Ошибка: ' + error.message);
        statusText.textContent = 'Ошибка: ' + error.message;
        updateConnectionStatus(false);
    }
}

// Обработка обновления температуры
function handleTempUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    if (tempSpan) {
        tempSpan.textContent = parseFloat(value).toFixed(1);
        log('🌡️ Температура: ' + value + '°C');
    }
}

// Обработка обновления влажности
function handleHumUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    if (humSpan) {
        humSpan.textContent = parseFloat(value).toFixed(1);
        log('💧 Влажность: ' + value + '%');
    }
}

// Обработка системной информации
function handleSysInfoUpdate(event) {
    const value = new TextDecoder().decode(event.target.value);
    if (value.startsWith('eff:')) {
        const eff = parseFloat(value.substring(4)).toFixed(1);
        if (effSpan) {
            effSpan.textContent = eff;
            log('📈 Эффективность: ' + eff + '%/мин');
        }
    }
}

// Инициализация при загрузке страницы
window.addEventListener('load', () => {
    const container = document.querySelector('.container');
    
    // Создаем лог
    const logDiv = document.createElement('div');
    logDiv.id = 'log';
    logDiv.style.cssText = `
        margin-top: 20px;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 5px;
        font-family: monospace;
        font-size: 12px;
        max-height: 200px;
        overflow-y: auto;
    `;
    
    // Создаем кнопку подключения
    const connectBtn = document.createElement('button');
    connectBtn.className = 'connect-btn';
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
        margin-top: 20px;
    `;
    connectBtn.onclick = connect;
    
    container.appendChild(logDiv);
    container.appendChild(connectBtn);
    
    log('✅ Страница загружена. Нажмите кнопку для подключения.');
});

// Проверка поддержки Web Bluetooth
if (!navigator.bluetooth) {
    statusText.textContent = 'Web Bluetooth не поддерживается';
}