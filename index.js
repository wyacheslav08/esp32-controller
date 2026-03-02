/**
 * main.js
 *
 * Этот файл содержит логику JavaScript для веб-интерфейса BLE-устройства "GuitarCabinet".
 * Он отвечает за подключение к устройству, чтение и запись характеристик BLE,
 * отображение данных датчиков, статуса системы и настроек, а также за управление ими.
 */

// =========================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ
// =========================================================================

// UUID сервисов и характеристик BLE
const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_SERVICE_UUID_2 = "4fafc202-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_TARGET_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a1";
const BLE_CHAR_CURRENT_TEMP_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a2";
const BLE_CHAR_CURRENT_HUM_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a3";
const BLE_CHAR_ALL_SETTINGS_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a4";
const BLE_CHAR_SYS_INFO_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a5";
const BLE_CHAR_K10_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a6";
const BLE_CHAR_COMMAND_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a7";

// Объекты BLE
let bluetoothDevice = null;
let gattServer = null;
let primaryService1 = null; // Глобальная переменная для первого сервиса
let primaryService2 = null; // Глобальная переменная для второго сервиса
// Инициализируем характеристики со всеми ожидаемыми UUID, устанавливая их в null
let characteristics = {
    targetHum: null,
    currentTemp: null,
    currentHum: null,
    allSettings: null,
    sysInfo: null,
    k10: null,
    command: null
};

// Управление опросом данных
let pollingInterval = null;
const POLLING_RATE_MS = 3000; // Частота опроса данных датчиков и K10
let sysInfoPollingInterval = null; // ДОБАВЛЕНО: Отдельный интервал для опроса SysInfo, если уведомления не работают
const SYSINFO_POLLING_RATE_MS = 2000; // Чаще, чем основной опрос

// Для хранения текущих значений настроек и их определений
let currentSettingsValues = {}; // Хранит последние прочитанные значения настроек
let allSettingDefinitions = []; // Метаданные для всех настроек (тип, мин/макс, лейбл и т.д.)

// Элементы DOM (будут инициализированы после загрузки страницы)
let connectButton = null;
let statusLed = null;
let statusText = null;
let debugLogElement = null;

// =========================================================================
// ИНИЦИАЛИЗАЦИЯ И ОБЩИЕ УТИЛИТЫ
// =========================================================================

/**
 * Инициализирует метаданные для всех настроек.
 * Это помогает динамически создавать элементы управления и парсить/отправлять данные.
 */
function initializeSettingDefinitions() {
    allSettingDefinitions = [
        // --- Основные настройки ---
        { key: 'targetHumidity', label: 'Целевая влажность', type: 'number', min: 0, max: 100, step: 1, unit: '%' },
        { key: 'lockHoldTime', label: 'Время удержания (K10)', type: 'number', min: 100, max: 5000, step: 100, unit: ' мс' },
        
        // --- Таймауты ---
        { key: 'lockTimeIndex', label: 'Таймаут блокировки меню', type: 'select', options: [
            {value: "0", text: "ОТКЛ"}, {value: "1", text: "30 сек."}, {value: "2", text: "1 мин."}, 
            {value: "3", text: "2 мин."}, {value: "4", text: "5 мин."}
        ]},
        { key: 'menuTimeoutOptionIndex', label: 'Таймаут меню', type: 'select', options: [
            {value: "0", text: "ОТКЛ"}, {value: "1", text: "15 сек."}, {value: "2", text: "30 сек."}, 
            {value: "3", text: "1 мин."}, {value: "4", text: "2 мин."}
        ]},
        { key: 'screenTimeoutOptionIndex', label: 'Таймаут экрана', type: 'select', options: [
            {value: "0", text: "ОТКЛ"}, {value: "1", text: "30 сек."}, {value: "2", text: "1 мин."}, 
            {value: "3", text: "5 мин."}, {value: "4", text: "10 мин."}
        ]},

        // --- Звуковые оповещения ---
        { key: 'doorSoundEnabled', label: 'Звук открытой двери', type: 'checkbox' },
        { key: 'waterSilicaSoundEnabled', label: 'Звук ресурсов', type: 'checkbox' },

        // --- Подогрев воды ---
        { key: 'waterHeaterEnabled', label: 'Подогрев воды', type: 'checkbox' },
        { key: 'waterHeaterMaxTemp', label: 'Макс. темп. подогрева', type: 'number', min: 20, max: 45, step: 1, unit: '°C' }, // Максимум 45°C для безопасности

        // --- Логика влажности ---
        { key: 'deadZonePercent', label: 'Мертвая зона', type: 'number', min: 0.1, max: 10.0, step: 0.1, unit: '%', float: true },
        { key: 'minHumidityChangeForTimeout', label: 'Мин. изменение H% (тайм.)', type: 'number', min: 0.1, max: 5.0, step: 0.1, unit: '%', float: true },
        { key: 'maxOperationDuration', label: 'Макс. время работы', type: 'number', min: 1, max: 60, step: 1, unit: ' мин' },
        { key: 'operationCooldown', label: 'Время "отдыха"', type: 'number', min: 1, max: 30, step: 1, unit: ' мин' },
        { key: 'maxSafeHumidity', label: 'Макс. безопасная H%', type: 'number', min: 50, max: 100, step: 1, unit: '%' },
        { key: 'resourceCheckDiff', label: 'Порог разницы ресурсов', type: 'number', min: 1, max: 20, step: 1, unit: '%' },
        { key: 'humidityHysteresis', label: 'Гистерезис влажности', type: 'number', min: 0.1, max: 5.0, step: 0.1, unit: '%', float: true },
        { key: 'resourceLowFaultThreshold', label: 'Порог "Мало ресурсов"', type: 'number', min: 1, max: 10, step: 1 },
        { key: 'resourceEmptyFaultThreshold', label: 'Порог "Нет ресурсов"', type: 'number', min: 1, max: 20, step: 1 },
        
        // --- Калибровка DHT ---
        { key: 'tempOffsetTop', label: 'Смещение темп. (верх.)', type: 'number', min: -20, max: 20, step: 1, unit: '°C' },
        { key: 'humOffsetTop', label: 'Смещение влаж. (верх.)', type: 'number', min: -20, max: 20, step: 1, unit: '%' },
        { key: 'tempOffsetHum', label: 'Смещение темп. (увл.)', type: 'number', min: -20, max: 20, step: 1, unit: '°C' },
        { key: 'humOffsetHum', label: 'Смещение влаж. (увл.)', type: 'number', min: -20, max: 20, step: 1, unit: '%' },

        // --- Авто-перезагрузка ---
        { key: 'autoRebootEnabled', label: 'Авто-перезагрузка', type: 'checkbox' },
        { key: 'autoRebootHour', label: 'Час перезагрузки', type: 'number', min: 0, max: 23, step: 1, unit: ' ч' },
        { key: 'autoRebootMinute', label: 'Минута перезагрузки', type: 'number', min: 0, max: 59, step: 1, unit: ' мин' },
        { key: 'autoRebootDays', label: 'Интервал перезагрузки', type: 'number', min: 1, max: 30, step: 1, unit: ' дней' },

        // --- Статистика (только для чтения) ---
        { key: 'resetCount', label: 'Счетчик ручных сбросов', type: 'readonly' },
        { key: 'wdtResetCount', label: 'Счетчик WDT сбросов', type: 'readonly' },
        { key: 'autoRebootCounter', label: 'Счетчик авто-перезагрузок', type: 'readonly' },
        { key: 'totalRebootCounter', label: 'Общий счетчик перезагрузок', type: 'readonly' },
        { key: 'lastRebootTimestamp', label: 'Время последней перезагрузки', type: 'readonly', timestamp: true } // Unix timestamp
    ];
}
/**
 * Добавляет стили CSS динамически к странице.
 * Это обеспечивает, что интерфейс выглядит правильно без отдельного файла CSS.
 */
function addStyles() {
    const styles = `
        body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; color: #333; margin: 0; padding: 20px; display: flex; justify-content: center; }
        .container { background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); padding: 25px; width: 100%; max-width: 600px; box-sizing: border-box; }
        h1, h2, h3 { color: #2c3e50; text-align: center; margin-bottom: 20px; }
        .status { display: flex; align-items: center; justify-content: center; margin-bottom: 20px; padding: 10px; border-radius: 8px; background-color: #e0e7eb; }
        .status-led { width: 15px; height: 15px; border-radius: 50%; background-color: #ccc; margin-right: 10px; transition: background-color 0.3s; }
        .status-led-connected { background-color: #4caf50; }
        .status-led-connecting { background-color: #ffc107; }
        .status-led-disconnected { background-color: #f44336; }
        .status-led-error { background-color: #f44336; } /* Добавлено для явного отображения ошибки */
        .status-text { font-size: 16px; font-weight: 500; color: #555; }

        .sensor-card { background: #f8f9fa; border-radius: 10px; padding: 15px; margin: 10px 0; text-align: center; border: 1px solid #e0e0e0; }
        .sensor-label { font-size: 14px; color: #666; margin-bottom: 5px; }
        .sensor-value { font-size: 32px; font-weight: bold; color: #333; }
        
        .connect-btn { background: #2196f3; color: white; border: none; padding: 12px 24px; border-radius: 25px; font-size: 16px; cursor: pointer; width: 100%; margin: 20px 0; transition: background-color 0.3s, transform 0.2s; }
        .connect-btn:hover { background: #1976d2; transform: translateY(-2px); }
        .connect-btn:active { background: #1565c0; transform: translateY(0); }
        .connect-btn.connected { background: #f44336; }
        .connect-btn.connected:hover { background: #d32f2f; }
        .connect-btn:disabled { background: #9e9e9e; cursor: not-allowed; }

        .debug-panel { background: #263238; color: #4caf50; padding: 10px; border-radius: 5px; margin-top: 20px; max-height: 200px; overflow-y: auto; font-size: 12px; line-height: 1.4; border: 1px solid #37474f; }
        .debug-panel h3 { color: #90caf9; margin-top: 0; margin-bottom: 10px; text-align: left; }
        #debug-log { max-height: 150px; overflow-y: auto; }
        .log-entry { margin: 2px 0; padding: 2px; border-bottom: 1px solid #37474f; color: #cfd8dc; }
        .log-entry.error { color: #ff6b6b; }
        .log-entry.success { color: #a5d6a7; }
        .log-entry.info { color: #90caf9; }
        .log-entry.warn { color: #ffeb3b; } /* Добавлено для предупреждений */

        .k10-section { margin-top: 20px; padding: 15px; background: #fffde7; border-radius: 10px; border: 1px solid #ffe0b2; }
        .k10-section h3 { color: #f57c00; margin-bottom: 15px; text-align: left; border-bottom: 1px solid #ffe0b2; padding-bottom: 10px;}
        .k10-button { background: #ff9800; color: white; border: none; padding: 15px; border-radius: 50px; font-size: 18px; width: 100%; cursor: pointer; margin: 10px 0; transition: background-color 0.3s, transform 0.2s; }
        .k10-button:hover { background: #fb8c00; transform: translateY(-2px); }
        .k10-button:active { background: #e65100; transform: translateY(0); }
        .k10-status { margin-top: 10px; padding: 10px; background: #ffe0b2; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
        .door-closed { background: #c8e6c9; color: #2e7d32; padding: 3px 8px; border-radius: 4px; }
        .door-open { background: #ffcdd2; color: #c62828; padding: 3px 8px; border-radius: 4px; }
        .lock-active { background: #fff9c4; color: #fbc02d; padding: 5px; text-align: center; border-radius: 4px; animation: blink 1s infinite; font-weight: bold; margin-top: 10px; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        
        .settings-card { background: white; border-radius: 10px; padding: 15px; margin-top: 20px; border: 1px solid #e0e0e0; }
        .settings-group { background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 20px; border: 1px solid #e0e0e0; }
        .settings-group h3 { margin: 0 0 15px 0; color: #2196f3; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; text-align: left;}
        .setting-item { margin: 10px 0; padding: 10px; background: white; border-radius: 8px; border: 1px solid #e0e0e0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;}
        .setting-item label { flex: 1; margin-right: 10px; font-weight: 500; color: #555; }
        .setting-item input[type="number"], .setting-item select { flex: 0 0 120px; padding: 8px; border-radius: 5px; border: 1px solid #ccc; font-size: 14px; }
        .setting-item input[type="checkbox"] { margin-right: 10px; transform: scale(1.2); }
        .setting-item strong { color: #333; font-weight: bold; }

        .button-group { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center; }
        .btn { padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; font-weight: 500; font-size: 14px; transition: background-color 0.3s, transform 0.2s; }
        .btn:hover { transform: translateY(-2px); }
        .btn:active { transform: translateY(0); }
        .btn:disabled { background: #9e9e9e; cursor: not-allowed; }

        .btn-primary { background: #4caf50; color: white; }
        .btn-primary:hover { background: #388e3c; }
        .btn-secondary { background: #2196f3; color: white; }
        .btn-secondary:hover { background: #1976d2; }
        .btn-danger { background: #f44336; color: white; }
        .btn-danger:hover { background: #d32f2f; }
        .btn-warning { background: #ff9800; color: white; }
        .btn-warning:hover { background: #fb8c00; }

        .status-on { color: #4caf50; font-weight: bold; }
        .status-off { color: #f44336; font-weight: bold; }
        .status-warning { color: #ff9800; font-weight: bold; }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

/**
 * Логирует сообщения в консоль и в специальный DOM-элемент для отладки.
 * @param {string} message - Сообщение для логирования.
 * @param {string} [type='info'] - Тип сообщения ('info', 'success', 'error', 'warn').
 */
function log(message, type = 'info') {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
    if (debugLogElement) {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        debugLogElement.appendChild(entry);
        debugLogElement.scrollTop = debugLogElement.scrollHeight; // Прокрутка к последнему сообщению
    }
}

/**
 * Обновляет визуальный статус подключения (LED и текст).
 * @param {string} text - Текст статуса.
 * @param {string} state - Состояние ('connecting', 'connected', 'disconnected', 'error').
 */
function updateStatus(text, state) {
    if (statusText) statusText.textContent = text;
    if (statusLed) {
        statusLed.className = 'status-led'; // Сбросить все классы состояния
        if (state) statusLed.classList.add(`status-led-${state}`);
    }
}

// =========================================================================
// ФУНКЦИИ ПОДКЛЮЧЕНИЯ И ОТКЛЮЧЕНИЯ BLE
// =========================================================================

/**
 * Инициирует процесс подключения к BLE-устройству.
 */
async function connectToDevice() {
    try {
        if (bluetoothDevice && gattServer?.connected) {
            await disconnectFromDevice(); // Отключиться, если уже подключены
            return;
        }
        
        updateStatus('🔍 Поиск...', 'connecting');
        if (connectButton) {
            connectButton.disabled = true;
            connectButton.textContent = '⏳ Поиск...';
        }
        
        // Запрос устройства по имени-префиксу и списку ВСЕХ сервисов
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'GuitarCabinet' }],
            optionalServices: [BLE_SERVICE_UUID, BLE_SERVICE_UUID_2] // ОБЯЗАТЕЛЬНО ДОБАВЬТЕ ВТОРОЙ СЕРВИС
        });

        log(`✅ Найдено: ${bluetoothDevice.name}`, 'success');
        
        // Добавляем слушатель события отключения ДО подключения GATT
        bluetoothDevice.addEventListener('gattserverdisconnected', handleDisconnect);
        
        gattServer = await bluetoothDevice.gatt.connect();
        if (!gattServer) { // Защитная проверка
            throw new Error('GATT server connection failed unexpectedly.');
        }
        log('✅ GATT сервер подключен', 'success');
        
        // --- НОВЫЙ ШАГ: Получаем ОБА сервиса и присваиваем глобальным переменным ---
        primaryService1 = await gattServer.getPrimaryService(BLE_SERVICE_UUID); // Присваиваем глобальной
        if (!primaryService1) { // Защитная проверка
            throw new Error(`Primary Service 1 (UUID: ${BLE_SERVICE_UUID}) not found.`);
        }
        log('✅ BLE Сервис 1 найден', 'success');
        
        primaryService2 = await gattServer.getPrimaryService(BLE_SERVICE_UUID_2); // Присваиваем глобальной
        if (!primaryService2) { // Защитная проверка
            throw new Error(`Primary Service 2 (UUID: ${BLE_SERVICE_UUID_2}) not found.`);
        }
        log('✅ BLE Сервис 2 найден', 'success');

        // Передаем ГЛОБАЛЬНЫЕ сервисы в функцию findCharacteristics
        await findCharacteristics(primaryService1, primaryService2);
        
        updateStatus('✅ Подключено', 'connected');
        if (connectButton) {
            connectButton.textContent = '❌ Отключиться';
            connectButton.classList.add('connected');
            connectButton.disabled = false;
        }
        
        // Создаем динамические секции интерфейса только если K10 найдена (она в Service 1)
        if (characteristics.k10) { 
            createK10Section();
        } else {
            log('❌ Характеристика K10 не найдена, секция K10 не будет создана.', 'error');
        }

        await loadAllData(); // Загружаем все данные
        startPolling();      // Запускаем опрос
        
    } catch (error) {
        log(`❌ Ошибка подключения: ${error instanceof Error ? error.message : JSON.stringify(error)}`, 'error');
        updateStatus('❌ Ошибка', 'error');
        if (connectButton) {
            connectButton.disabled = false;
            connectButton.textContent = '🔄 Повторить подключение';
            connectButton.classList.remove('connected');
        }
        disconnectFromDevice(); // Очищаем состояние при ошибке
    }
}

/**
 * Находит все необходимые BLE-характеристики из одного или нескольких сервисов
 * и сохраняет их в объекте `characteristics`.
 * @param {BluetoothRemoteGATTService} service1 - Первый объект сервиса.
 * @param {BluetoothRemoteGATTService} [service2] - Второй объект сервиса (опционально).
 */
async function findCharacteristics(service1, service2 = null) {
    log('Поиск характеристик...');
    
    let allChars = []; // Буфер для всех найденных характеристик
    
    // Поиск характеристик в первом сервисе
    let chars1 = await service1.getCharacteristics();
    allChars = allChars.concat(chars1);
    log(`Найдено ${chars1.length} характеристик в Сервисе 1.`);

    // Если есть второй сервис, ищем характеристики и в нем
    if (service2) {
        let chars2 = await service2.getCharacteristics();
        allChars = allChars.concat(chars2);
        log(`Найдено ${chars2.length} характеристик в Сервисе 2.`);
    }
    
    log(`Всего найдено ${allChars.length} характеристик.`); // Логируем общее количество найденных
    
    allChars.forEach(char => {
        log(`  Обнаружена характеристика UUID: ${char.uuid.toLowerCase()}. Свойства: notify=${char.properties.notify}, read=${char.properties.read}, write=${char.properties.write}, indicate=${char.properties.indicate}`, 'info');
    });

    // Перебираем найденные характеристики и назначаем их в объект 'characteristics'
    for (let char of allChars) {
        const uuid = char.uuid.toLowerCase();
        
        if (uuid.includes('26a1')) characteristics.targetHum = char;
        else if (uuid.includes('26a2')) characteristics.currentTemp = char;
        else if (uuid.includes('26a3')) characteristics.currentHum = char;
        else if (uuid.includes('26a4')) characteristics.allSettings = char;
        else if (uuid.includes('26a5')) characteristics.sysInfo = char;
        else if (uuid.includes('26a6')) characteristics.k10 = char;
        else if (uuid.includes('26a7')) characteristics.command = char;
    }

    // Проверяем, что все ожидаемые характеристики были найдены
    let allExpectedFound = true;
    for (const key in characteristics) {
        if (characteristics[key] === null) {
            log(`❌ Характеристика '${key}' (UUID: ${getCharUUIDByName(key)}) НЕ ОБНАРУЖЕНА клиентом.`, 'error');
            allExpectedFound = false;
        }
    }
    if (allExpectedFound) {
        log(`✅ Все 7 характеристик обнаружены клиентом.`, 'success');
    } else {
        log(`⚠️ Некоторые характеристики не были обнаружены. Работа с ними может быть ограничена.`, 'warn');
    }

    // Добавим небольшую задержку перед настройкой уведомлений, на всякий случай
    await new Promise(resolve => setTimeout(resolve, 500));

    log(`✅ Характеристики сопоставлены. Настройка уведомлений...`);

    // Вспомогательная функция для безопасной подписки
    const safeStartNotify = async (char, name, parser) => {
        if (!char) { 
            log(`🔔 NOTIFY: Характеристика '${name}' не найдена. Пропускаем настройку уведомлений.`, 'info');
            return false;
        }
        if (char.properties.notify) {
            try {
                log(`🔔 NOTIFY: Пытаемся включить уведомления для '${name}' (UUID: ${char.uuid}). Свойства: notify=${char.properties.notify}, read=${char.properties.read}, write=${char.properties.write}, indicate=${char.properties.indicate}`, 'info');

                char.addEventListener('characteristicvaluechanged', (event) => {
                    const data = new TextDecoder('utf-8').decode(event.target.value);
                    parser(data);
                    log(`🔔 NOTIFY: Получены данные для '${name}': ${data}`, 'info');
                });
                await char.startNotifications();
                log(`🔔 Уведомления '${name}' включены`, 'success');
                return true;
            } catch (e) {
                log(`❌ НЕ УДАЛОСЬ включить уведомления для '${name}' (UUID: ${char.uuid}): ${e.message}`, 'error');
                return false;
            }
        } else {
            log(`🔔 NOTIFY: Характеристика '${name}' (UUID: ${char.uuid}) не поддерживает уведомления (notify=false).`, 'info');
            return false;
        }
    };

    // Подписываемся по очереди с обработкой ошибок
    await safeStartNotify(characteristics.currentTemp, 'Температура', (data) => {
        const temp = parseFloat(data.substring(2));
        if (!isNaN(temp)) updateTempDisplay(temp);
    });

    await safeStartNotify(characteristics.currentHum, 'Влажность', (data) => {
        const hum = parseFloat(data.substring(2));
        if (!isNaN(hum)) updateHumDisplay(hum);
    });

    // ИСПРАВЛЕНИЕ: Специальная обработка для SysInfo.
    // Если уведомления не включаются, запускаем опрос.
    const sysInfoNotificationsEnabled = await safeStartNotify(characteristics.sysInfo, 'Система', parseSysInfo);
    if (!sysInfoNotificationsEnabled && characteristics.sysInfo) {
        log('⚠️ Уведомления для SysInfo не поддерживаются или не удалось включить. Запускаем опрос SysInfo.', 'warn');
        if (sysInfoPollingInterval) clearInterval(sysInfoPollingInterval);
        sysInfoPollingInterval = setInterval(async () => {
            if (gattServer?.connected && characteristics.sysInfo) {
                const sysInfoData = await readCharacteristic(characteristics.sysInfo, 'системной информации (опрос)');
                if (sysInfoData) parseSysInfo(sysInfoData);
            } else {
                if (sysInfoPollingInterval) clearInterval(sysInfoPollingInterval);
                sysInfoPollingInterval = null;
            }
        }, SYSINFO_POLLING_RATE_MS);
    }
    
    await safeStartNotify(characteristics.k10, 'K10/Замок', parseK10Status);

    await safeStartNotify(characteristics.allSettings, 'Настройки', parseAndDisplaySettings);

    log(`✅ Настройка уведомлений завершена`, 'success');
}

/**
 * Читает значение из указанной BLE-характеристики.
 * @param {BluetoothRemoteGATTCharacteristic} char - Объект характеристики.
 * @param {string} name - Имя характеристики для логирования.
 * @returns {Promise<string|null>} - Промис с прочитанным значением или null в случае ошибки.
 */
async function readCharacteristic(char, name) {
    if (!char) {
        log(`❌ Характеристика '${name}' не найдена. Невозможно прочитать.`, 'error');
        return null;
    }
    try {
        const value = await char.readValue();
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(value);
    } catch (e) {
        log(`❌ Ошибка чтения характеристики '${name}' (UUID: ${char.uuid}): ${e.message}`, 'error');
        return null;
    }
}

/**
 * Отключается от BLE-устройства и очищает состояние интерфейса.
 */
async function disconnectFromDevice() {
    log('Отключение от устройства...', 'info');
    
    // Останавливаем опрос
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    if (sysInfoPollingInterval) { 
        clearInterval(sysInfoPollingInterval);
        sysInfoPollingInterval = null;
    }
    
    // Останавливаем уведомления
    for (const key in characteristics) {
        const char = characteristics[key];
        if (char && char.properties.notify) {
            try {
                await char.stopNotifications();
                log(`🔔 Отписка от уведомлений для ${key}`, 'info');
            } catch (e) {
                log(`❌ Ошибка при отписке от уведомлений для ${key}: ${e.message}`, 'error');
            }
        }
    }

    // Отключаемся от GATT-сервера
    if (gattServer && gattServer.connected) {
        try {
            gattServer.disconnect();
            log('GATT сервер отключен.', 'info');
        } catch (e) {
            log(`❌ Ошибка при отключении GATT: ${e.message}`, 'error');
        }
    }
    
    // Сбрасываем все BLE-объекты
    gattServer = null;
    primaryService1 = null; // Сбрасываем глобальный сервис 1
    primaryService2 = null; // Сбрасываем глобальный сервис 2
    for (const key in characteristics) {
        characteristics[key] = null;
    }
    
    if (bluetoothDevice) {
        bluetoothDevice.removeEventListener('gattserverdisconnected', handleDisconnect);
        bluetoothDevice = null;
    }
    
    handleDisconnect(); // Обновляем UI до отключенного состояния
}

/**
 * Обработчик события отключения GATT-сервера.
 */
function handleDisconnect() {
    log('❌ Устройство отключено', 'error');
    updateStatus('❌ Отключено', 'disconnected');
    
    if (connectButton) {
        connectButton.textContent = '🔌 Подключиться к устройству';
        connectButton.classList.remove('connected');
        connectButton.disabled = false;
    }
    
    // Удаляем все динамически добавленные секции интерфейса
    ['temp-display', 'hum-display', 'sys-info-display', 'k10-section', 'settings-display'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
}

// =========================================================================
// ЗАГРУЗКА И ОПРОС ДАННЫХ
// =========================================================================

/**
 * Загружает все необходимые данные с устройства при подключении.
 */
async function loadAllData() {
    log('📥 Загрузка всех данных с устройства...');
    
    // ИСПРАВЛЕНИЕ: Добавляем проверки на наличие характеристик перед чтением
    if (characteristics.currentTemp) {
        const tempData = await readCharacteristic(characteristics.currentTemp, 'температуры');
        if (tempData && tempData.startsWith('T:')) {
            const temp = parseFloat(tempData.substring(2));
            if (!isNaN(temp)) updateTempDisplay(temp);
        }
    } else { log(`❌ Характеристика 'Температура' не найдена для загрузки.`, 'error'); }
    
    if (characteristics.currentHum) {
        const humData = await readCharacteristic(characteristics.currentHum, 'влажности');
        if (humData && humData.startsWith('H:')) {
            const hum = parseFloat(humData.substring(2));
            if (!isNaN(hum)) updateHumDisplay(hum);
        }
    } else { log(`❌ Характеристика 'Влажность' не найдена для загрузки.`, 'error'); }
    
    // SysInfo теперь обрабатывается через уведомления или отдельный опрос, не читаем здесь
    // const sysInfoData = await readCharacteristic(characteristics.sysInfo, 'системной информации');
    // if (sysInfoData) { parseSysInfo(sysInfoData); }
    
    if (characteristics.allSettings) {
        const settingsData = await readCharacteristic(characteristics.allSettings, 'настроек');
        if (settingsData) {
            parseAndDisplaySettings(settingsData);
        }
    } else { log(`❌ Характеристика 'Настройки' не найдена для загрузки.`, 'error'); }
    
    if (characteristics.k10) {
        const k10Data = await readCharacteristic(characteristics.k10, 'K10');
        if (k10Data) {
            parseK10Status(k10Data);
        }
    } else { log(`❌ Характеристика 'K10' не найдена для загрузки.`, 'error'); }

    // Характеристика Command только для записи, не читаем ее здесь
    if (!characteristics.command) {
        log(`❌ Характеристика 'Command' не найдена для использования.`, 'error');
    }

    log('✅ Все данные загружены.', 'success');
}

/**
 * Запускает периодический опрос характеристик BLE.
 */
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        if (!gattServer?.connected) {
            log('Polling: GATT сервер не подключен, останавливаем опрос.', 'info');
            clearInterval(pollingInterval);
            pollingInterval = null;
            return;
        }
        
        // Опрашиваем температуру и влажность, только если уведомления НЕ были включены
        if (characteristics.currentTemp && !characteristics.currentTemp.properties.notify) { 
            const tempData = await readCharacteristic(characteristics.currentTemp, 'температуры');
            if (tempData && tempData.startsWith('T:')) {
                const temp = parseFloat(tempData.substring(2));
                if (!isNaN(temp)) updateTempDisplay(temp);
            }
        }
        
        if (characteristics.currentHum && !characteristics.currentHum.properties.notify) { 
            const humData = await readCharacteristic(characteristics.currentHum, 'влажности');
            if (humData && humData.startsWith('H:')) {
                const hum = parseFloat(humData.substring(2));
                if (!isNaN(hum)) updateHumDisplay(hum);
            }
        }
        
        // SysInfo теперь обрабатывается через уведомления или отдельный интервал, не опрашиваем здесь
        // if (characteristics.sysInfo && !characteristics.sysInfo.properties.notify) { 
        //     const sysInfoData = await readCharacteristic(characteristics.sysInfo, 'системной информации');
        //     if (sysInfoData) {
        //         parseSysInfo(sysInfoData);
        //     }
        // }
        
        // Опрашиваем K10, только если уведомления НЕ были включены
        if (characteristics.k10 && !characteristics.k10.properties.notify) { 
            const k10Data = await readCharacteristic(characteristics.k10, 'K10');
            if (k10Data) {
                parseK10Status(k10Data);
            }
        } else if (!characteristics.k10) {
            // log(`❌ Характеристика 'K10' не найдена при опросе.`, 'error'); // Уже логируется в findCharacteristics
        }

        // Логируем отсутствие Command, если она нужна для кнопок
        if (!characteristics.command) {
            // log(`❌ Характеристика 'Command' не найдена или BLE не подключен. Не могу отправить команду.`, 'error'); // Уже логируется в findCharacteristics
        }
        
    }, POLLING_RATE_MS);
    log(`🔄 Запущен опрос данных каждые ${POLLING_RATE_MS / 1000} секунд.`, 'info');
}

// =========================================================================
// ОТОБРАЖЕНИЕ ДАННЫХ ДАТЧИКОВ
// =========================================================================

/**
 * Обновляет отображение текущей температуры на UI.
 * @param {number} temp - Значение температуры.
 */
function updateTempDisplay(temp) {
    let el = document.getElementById('temp-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'temp-display';
        el.className = 'sensor-card';
        // Вставляем после элемента статуса
        document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    el.innerHTML = `<div class="sensor-label">🌡️ Температура</div><div class="sensor-value">${temp.toFixed(1)}°C</div>`;
}

/**
 * Обновляет отображение текущей влажности на UI.
 * @param {number} hum - Значение влажности.
 */
function updateHumDisplay(hum) {
    let el = document.getElementById('hum-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'hum-display';
        el.className = 'sensor-card';
        // Вставляем после температуры
        const tempEl = document.getElementById('temp-display');
        tempEl ? tempEl.parentNode.insertBefore(el, tempEl.nextSibling) : 
                 document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    el.innerHTML = `<div class="sensor-label">💧 Влажность</div><div class="sensor-value">${hum.toFixed(1)}%</div>`;
}

/**
 * Парсит строку системной информации и обновляет соответствующие элементы UI.
 * @param {string} data - Строка системной информации (например, "E:1.5,RES_W:LOW,HUM_RELAY:ON").
 */
function parseSysInfo(data) {
    if (!data) return;

    let efficiency = NaN;
    let waterStatus = '';
    let silicaStatus = '';
    let humRelayStatus = '';
    let ventRelayStatus = '';
    let waterHeaterStatus = ''; 
    let whSafeShutdown = false; 

    const parts = data.split(',');
    parts.forEach(part => {
        const [key, value] = part.split(':');
        if (!key || !value) return;

        const cleanKey = key.trim();
        const cleanValue = value.trim();

        if (cleanKey === 'E') {
            efficiency = parseFloat(cleanValue);
        } else if (cleanKey === 'RES_W') {
            waterStatus = cleanValue;
        } else if (cleanKey === 'RES_S') {
            silicaStatus = cleanValue;
        } else if (cleanKey === 'HUM_RELAY') {
            humRelayStatus = cleanValue;
        } else if (cleanKey === 'VENT_RELAY') {
            ventRelayStatus = cleanValue;
        } else if (cleanKey === 'WATER_HEATER') {
            waterHeaterStatus = cleanValue;
        } else if (cleanKey === 'WH_SAFE_SHUTDOWN') {
            whSafeShutdown = (cleanValue === '1');
        }
    });

    let el = document.getElementById('sys-info-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'sys-info-display';
        el.className = 'sensor-card';
        // Вставляем после humidity display
        const humEl = document.getElementById('hum-display');
        humEl ? humEl.parentNode.insertBefore(el, humEl.nextSibling) :
                document.querySelector('.status').parentNode.insertBefore(el, document.querySelector('.status').nextSibling);
    }
    
    let htmlContent = `<div class="sensor-label">⚡ Системный статус</div>`;
    
    if (!isNaN(efficiency)) {
        htmlContent += `<div style="font-size: 20px; font-weight: bold; color: #333; margin-bottom: 5px;">Эффективность: ${efficiency.toFixed(1)}%/мин</div>`;
    }

    htmlContent += `<div style="font-size: 14px; margin-top: 10px; text-align: left; padding-left: 10px;">`;
    htmlContent += `💧 Вода: <strong class="${waterStatus === 'EMPTY' ? 'status-off' : (waterStatus === 'LOW' ? 'status-warning' : 'status-on')}">${waterStatus || 'OK'}</strong><br>`; 
    htmlContent += `🍚 Силикагель: <strong class="${silicaStatus === 'EMPTY' ? 'status-off' : (silicaStatus === 'LOW' ? 'status-warning' : 'status-on')}">${silicaStatus || 'OK'}</strong><br>`; 
    htmlContent += `H% Реле: <strong class="${humRelayStatus === 'ON' ? 'status-on' : 'status-off'}">${humRelayStatus || 'OFF'}</strong><br>`;
    htmlContent += `Вентилятор: <strong class="${ventRelayStatus === 'ON' ? 'status-on' : 'status-off'}">${ventRelayStatus || 'OFF'}</strong><br>`;
    htmlContent += `Подогрев: <strong class="${waterHeaterStatus === 'ON' ? 'status-on' : 'status-off'}">${waterHeaterStatus || 'OFF'}</strong>`;
    if (whSafeShutdown) { 
        htmlContent += ` <span style="color: #f44336; font-weight: bold;">(АВАРИЯ!)</span>`;
    }
    htmlContent += `</div>`;
    
    el.innerHTML = htmlContent;
}


// =========================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ КНОТКОЙ K10 (ЗАМКОМ)
// =========================================================================

/**
 * Создает секцию управления кнопкой K10 (замком) на UI.
 */
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
    
    setupK10Button(); // Настраиваем обработчики событий для кнопки K10
}

/**
 * Настраивает обработчики событий для кнопки K10 для имитации удержания и активации.
 */
function setupK10Button() {
    const button = document.getElementById('k10-button');
    if (!button) return;
    
    let pressTimer = null;
    let isPressed = false;
    // Значение holdTime будет обновляться из BLE, по умолчанию 1000 мс
    button.dataset.holdTime = "1000"; 
    
    // Обработчики для мыши
    button.addEventListener('mousedown', startPress);
    button.addEventListener('mouseup', releasePress);
    button.addEventListener('mouseleave', releasePress);
    // Обработчики для тачскрина
    button.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Предотвращаем дублирование событий с мышью на мобильных
        startPress();
    });
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        releasePress();
    });

    /**
     * Отправляет команду K10 на устройство.
     * @param {string} cmd - Команда ("PRESS", "RELEASE", "ACTIVATE").
     */
    async function sendK10Command(cmd) {
        if (!characteristics.k10 || !gattServer?.connected) {
            log('❌ K10 характеристика не найдена или BLE не подключен, не могу отправить команду.', 'error');
            return;
        }
        try {
            // Убедитесь, что нет других операций записи в процессе
            // В данном случае, это уже будет обработано очередью промисов
            await characteristics.k10.writeValue(new TextEncoder().encode(cmd));
            log(`📤 K10: Отправлена команда "${cmd}"`, 'success');
            
            // Запрашиваем обновленный статус после отправки команды
            // Добавим небольшую задержку, чтобы ESP32 успел обработать
            await new Promise(resolve => setTimeout(resolve, 100)); // Добавляем задержку
            
            const data = await readCharacteristic(characteristics.k10, 'K10');
            if (data) parseK10Status(data);
            
        } catch (e) {
            log(`❌ K10: Ошибка при отправке команды "${cmd}": ${e.message}`, 'error');
        }
    }
    
    /**
     * Начинает имитацию нажатия кнопки K10.
     */
    async function startPress() { // <-- Сделать async
        if (isPressed) return;
        isPressed = true;
        await sendK10Command('PRESS'); // <-- Добавить await
        if (button) button.textContent = '⏳ Удерживайте...';
        
        const currentHoldTime = parseInt(button.dataset.holdTime || "1000"); 

        pressTimer = setTimeout(async () => { // <-- Оставить async здесь
            if (isPressed) {
                await sendK10Command('ACTIVATE'); // <-- Добавить await
                if (button) button.textContent = '🔒 Замок активирован!';
                const lockActiveDiv = document.getElementById('lock-active');
                if (lockActiveDiv) lockActiveDiv.style.display = 'block';
                const lockIcon = document.getElementById('lock-icon');
                if (lockIcon) lockIcon.textContent = '🔒';
            }
        }, currentHoldTime);
    }
    
    /**
     * Завершает имитацию нажатия кнопки K10.
     */
    async function releasePress() { // <-- Сделать async
        if (!isPressed) return;
        clearTimeout(pressTimer);
        await sendK10Command('RELEASE'); // <-- Добавить await
        if (button) button.textContent = '🔒 Удерживайте для активации';
        const lockActiveDiv = document.getElementById('lock-active');
        if (lockActiveDiv) lockActiveDiv.style.display = 'none';
        isPressed = false;
    }


}

/**
 * Парсит строку статуса K10 и обновляет соответствующие элементы UI.
 * @param {string} data - Строка статуса K10 (например, "LOCK:inactive,DOOR:closed,HOLD:1000").
 */
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
            const lockIcon = document.getElementById('lock-icon');
            if(lockIcon) lockIcon.textContent = isActive ? '🔒' : '🔓';
            const lockActiveDiv = document.getElementById('lock-active');
            if(lockActiveDiv) lockActiveDiv.style.display = isActive ? 'block' : 'none';
        } else if (cleanKey === 'DOOR') {
            const isOpen = cleanValue === 'open';
            const doorStatusDiv = document.getElementById('door-status');
            if (doorStatusDiv) {
                doorStatusDiv.innerHTML = `🚪 Состояние двери: <span class="${isOpen ? 'door-open' : 'door-closed'}">${isOpen ? 'Открыта' : 'Закрыта'}</span>`;
            }
        } else if (cleanKey === 'HOLD') {
            const holdTimeDiv = document.getElementById('hold-time');
            if (holdTimeDiv) {
                holdTimeDiv.innerHTML = `⏱️ Время удержания: ${cleanValue} мс`;
                // Обновляем значение в dataset кнопки K10
                const k10Button = document.getElementById('k10-button');
                if (k10Button) {
                    k10Button.dataset.holdTime = cleanValue; 
                }
            }
        }
    });
}

// =========================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ НАСТРОЙКАМИ
// =========================================================================

/**
 * Парсит строку со всеми настройками и динамически создает/обновляет UI-элементы для них.
 * @param {string} data - Строка со всеми настройками (например, "targetHumidity=50,lockHoldTime=1000,...").
 */
function parseAndDisplaySettings(data) {
    let el = document.getElementById('settings-display');
    if (!el) {
        el = document.createElement('div');
        el.id = 'settings-display';
        el.className = 'settings-card';
        document.querySelector('.container').appendChild(el);
    }
    
    el.innerHTML = '<h2>⚙️ Настройки системы</h2>'; // Очищаем и добавляем заголовок
    
    const settings = {};
    data.split(',').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) {
            settings[k.trim()] = v.trim();
        }
    });
    
    currentSettingsValues = settings; // Сохраняем текущие значения для отслеживания изменений
    
    let currentGroup = ''; // Для группировки настроек по разделам

    // Перебираем все предопределенные настройки
    allSettingDefinitions.forEach(def => {
        const { key, label, type, min, max, step, unit, options, float, timestamp } = def;
        const value = settings[key]; // Получаем значение из прочитанных данных

        if (value === undefined) {
             return; 
        }
        
        // Определяем группу для текущей настройки (УТОЧНЕНО)
        let groupName = 'Прочие'; 
        if (['targetHumidity', 'lockHoldTime'].includes(key)) groupName = 'Основные';
        else if (['lockTimeIndex', 'menuTimeoutOptionIndex', 'screenTimeoutOptionIndex'].includes(key)) groupName = 'Таймауты';
        else if (['doorSoundEnabled', 'waterSilicaSoundEnabled'].includes(key)) groupName = 'Звуковые оповещения';
        else if (['waterHeaterEnabled', 'waterHeaterMaxTemp'].includes(key)) groupName = 'Подогрев воды';
        else if (['deadZonePercent', 'minHumidityChangeForTimeout', 'maxOperationDuration', 'operationCooldown', 'maxSafeHumidity', 'resourceCheckDiff', 'humidityHysteresis', 'resourceLowFaultThreshold', 'resourceEmptyFaultThreshold'].includes(key)) groupName = 'Логика влажности';
        else if (['tempOffsetTop', 'humOffsetTop', 'tempOffsetHum', 'humOffsetHum'].includes(key)) groupName = 'Калибровка DHT';
        else if (['autoRebootEnabled', 'autoRebootHour', 'autoRebootMinute', 'autoRebootDays'].includes(key)) groupName = 'Авто-перезагрузка';
        else if (['resetCount', 'wdtResetCount', 'autoRebootCounter', 'totalRebootCounter', 'lastRebootTimestamp'].includes(key)) groupName = 'Статистика';

        // Создаем новую группу, если она изменилась
        if (groupName !== currentGroup) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'settings-group';
            groupDiv.innerHTML = `<h3>${groupName}</h3>`;
            el.appendChild(groupDiv);
            currentGroup = groupName;
        }

        const groupEl = el.querySelector(`.settings-group:last-child`);
        const settingItem = document.createElement('div');
        settingItem.className = 'setting-item';
        
        let controlHtml = '';
        
        // Генерация HTML для различных типов элементов управления
        if (type === 'number') {
            const parsedValue = float ? parseFloat(value) : parseInt(value);
            controlHtml = `
                <label for="setting-${key}">${label}: </label>
                <input type="number" 
                       id="setting-${key}" 
                       value="${parsedValue}" 
                       min="${min}" 
                       max="${max}" 
                       step="${step || 1}" 
                       ${(def.readonly || type === 'readonly') ? 'readonly' : ''}>${unit || ''}
            `;
        } else if (type === 'select') {
            controlHtml = `
                <label for="setting-${key}">${label}: </label>
                <select id="setting-${key}" ${(def.readonly || type === 'readonly') ? 'disabled' : ''}>
                    ${options.map(opt => `<option value="${opt.value}" ${value === opt.value ? 'selected' : ''}>${opt.text}</option>`).join('')}
                </select>
            `;
        } else if (type === 'checkbox') {
            controlHtml = `
                <input type="checkbox" id="setting-${key}" ${value === '1' ? 'checked' : ''} ${(def.readonly || type === 'readonly') ? 'disabled' : ''}>
                <label for="setting-${key}">${label}</label>
            `;
        } else if (type === 'readonly') {
            let displayValue = value;
            if (timestamp) {
                // Преобразуем Unix timestamp в читаемый формат
                const date = new Date(parseInt(value) * 1000);
                displayValue = date.toLocaleString(); // Использует локальный формат даты и времени
            }
            controlHtml = `
                <label>${label}: </label>
                <strong>${displayValue}</strong>
            `;
        }
        
        settingItem.innerHTML = controlHtml;
        groupEl.appendChild(settingItem);
    });
    
    // Добавляем кнопки управления в конце секции настроек
    el.innerHTML += `
        <div class="button-group">
            <button id="save-settings" class="btn btn-primary">💾 Сохранить все</button>
            <button id="refresh-settings" class="btn btn-secondary">🔄 Обновить</button>
            <button id="reset-defaults" class="btn btn-danger">⚠️ Сброс до заводских</button>
            <button id="reboot-device" class="btn btn-warning">🔄 Перезагрузить</button>
        </div>
    `;
    
    // Назначаем обработчики событий для кнопок
    document.getElementById('save-settings').onclick = sendSettingsToDevice;
    document.getElementById('refresh-settings').onclick = loadAllData;
    document.getElementById('reset-defaults').onclick = confirmAndSendReset;
    document.getElementById('reboot-device').onclick = confirmAndSendReboot;
}

/**
 * Собирает значения из всех интерактивных элементов управления настройками,
 * формирует строку и отправляет ее на устройство через характеристику `allSettings`.
 */
async function sendSettingsToDevice() {
    if (!characteristics.allSettings || !gattServer?.connected) {
        log('❌ Характеристика AllSettings не найдена или BLE не подключен. Не могу сохранить настройки.', 'error');
        return;
    }
    
    const updatedSettings = {};
    let settingsString = '';
    
    // Проходим по всем предопределенным настройкам
    allSettingDefinitions.forEach(def => {
        const { key, type, float } = def;
        const element = document.getElementById(`setting-${key}`);
        
        if (!element || type === 'readonly') return; // Пропускаем статистику и элементы без ID
        
        let valueToSend;
        if (type === 'checkbox') {
            valueToSend = element.checked ? '1' : '0';
        } else if (type === 'select') {
            valueToSend = element.value;
        } else if (type === 'number') {
            valueToSend = float ? parseFloat(element.value).toFixed(1) : parseInt(element.value);
        }
        
        // Отправляем только те настройки, которые изменились по сравнению с последними прочитанными
        // Преобразуем valueToSend и currentSettingsValues[key] в строки для сравнения, чтобы избежать проблем с типами
        if (String(valueToSend) !== String(currentSettingsValues[key])) {
             updatedSettings[key] = valueToSend;
             if (settingsString !== '') settingsString += ',';
             settingsString += `${key}=${valueToSend}`;
        }
    });

    if (settingsString === '') {
        log('ℹ️ Нет измененных настроек для отправки.', 'info');
        return;
    }
    
    log(`📤 Отправка настроек: ${settingsString}`, 'info');
    
    try {
        await characteristics.allSettings.writeValue(new TextEncoder().encode(settingsString));
        log('✅ Настройки успешно отправлены. Обновление через 1 секунду...', 'success');
        // Обновляем локальные значения после успешной отправки
        Object.assign(currentSettingsValues, updatedSettings); 
        setTimeout(loadAllData, 1000); // Перезагружаем все данные для проверки, что изменения применились
    } catch (e) {
        log(`❌ Ошибка при отправке настроек: ${e.message}`, 'error');
    }
}

/**
 * Отправляет команду на устройство через характеристику `command`.
 * @param {string} command - Команда для отправки ("RESET_TO_DEFAULTS", "REBOOT").
 */
async function sendCommandToDevice(command) {
    if (!characteristics.command || !gattServer?.connected) {
        log('❌ Характеристика Command не найдена или BLE не подключен. Не могу отправить команду.', 'error');
        return;
    }
    try {
        await characteristics.command.writeValue(new TextEncoder().encode(command));
        log(`📤 Команда "${command}" отправлена.`, 'success');
        if (command === 'RESET_TO_DEFAULTS' || command === 'REBOOT') {
            // Ожидаем перезагрузки, отключаемся
            setTimeout(() => {
                disconnectFromDevice();
                log('Устройство должно перезагрузиться...', 'info');
            }, 1000);
        }
    } catch (e) {
        log(`❌ Ошибка при отправке команды "${command}": ${e.message}`, 'error');
    }
}

/**
 * Запрашивает подтверждение и отправляет команду на сброс настроек к заводским.
 */
function confirmAndSendReset() {
    if (confirm('ВНИМАНИЕ: Вы уверены, что хотите сбросить ВСЕ настройки к заводским значениям? Устройство будет перезагружено.')) {
        sendCommandToDevice('RESET_TO_DEFAULTS');
    }
}

/**
 * Запрашивает подтверждение и отправляет команду на перезагрузку устройства.
 */
function confirmAndSendReboot() {
    if (confirm('Вы уверены, что хотите перезагрузить устройство?')) {
        sendCommandToDevice('REBOOT');
    }
}

//==============================================================================
// Вспомогательная функция для получения UUID по имени ключа, для логирования
//==============================================================================
function getCharUUIDByName(key) {
    switch (key) {
        case 'targetHum': return BLE_CHAR_TARGET_HUM_UUID;
        case 'currentTemp': return BLE_CHAR_CURRENT_TEMP_UUID;
        case 'currentHum': return BLE_CHAR_CURRENT_HUM_UUID;
        case 'allSettings': return BLE_CHAR_ALL_SETTINGS_UUID;
        case 'sysInfo': return BLE_CHAR_SYS_INFO_UUID;
        case 'k10': return BLE_CHAR_K10_UUID;
        case 'command': return BLE_CHAR_COMMAND_UUID;
        default: return 'UNKNOWN_UUID';
    }
}

// =========================================================================
// ОСНОВНОЙ ВХОД В СКРИПТ (После загрузки DOM)
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {

    
    // Инициализация ссылок на DOM-элементы
    statusLed = document.querySelector('.status-led');
    statusText = document.getElementById('statusText');
    
    // Динамическое создание кнопки подключения
    connectButton = document.createElement('button');
    connectButton.className = 'connect-btn';
    connectButton.textContent = '🔌 Подключиться к устройству';
    connectButton.onclick = connectToDevice;
    
    const container = document.querySelector('.container');
    // Вставляем кнопку после статуса, но перед остальным содержимым
    container.insertBefore(connectButton, document.querySelector('.status').nextSibling);
    
    // Динамическое создание панели отладки
    const debugPanel = document.createElement('div');
    debugPanel.className = 'debug-panel';
    debugPanel.innerHTML = '<h3>📋 Лог отладки:</h3><div id="debug-log"></div>';
    container.appendChild(debugPanel);
    debugLogElement = document.getElementById('debug-log'); // Сохраняем ссылку
    
    addStyles(); // Добавляем CSS стили
    initializeSettingDefinitions(); // Инициализируем метаданные настроек
    
    log('🚀 Веб-интерфейс загружен. Ожидание подключения...', 'info');
    updateStatus('Отключено', 'disconnected');

});

