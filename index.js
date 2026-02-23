// =========================================================================
// РАСШИРЯЕМАЯ АРХИТЕКТУРА BLE КЛИЕНТА
// =========================================================================

// 1. Конфигурация всех характеристик в одном месте
const BLE_CONFIG = {
    serviceUUID: "4fafc201-1fb5-459e-8fcc-c5c9c331914b",
    characteristics: [
        {
            name: 'targetHum',
            uuid: "beb5483e-36e1-4688-b7f5-ea07361b26a1",
            properties: ['read', 'write'],
            description: 'Целевая влажность',
            unit: '%',
            min: 0,
            max: 100,
            render: (value) => renderSlider('targetHum', value, 'Целевая влажность', '%')
        },
        {
            name: 'currentTemp',
            uuid: "beb5483e-36e1-4688-b7f5-ea07361b26a2",
            properties: ['read', 'notify'],
            description: 'Текущая температура',
            unit: '°C',
            render: (value) => renderSensor('temp', value, '🌡️ Температура', '°C')
        },
        {
            name: 'currentHum',
            uuid: "beb5483e-36e1-4688-b7f5-ea07361b26a3",
            properties: ['read', 'notify'],
            description: 'Текущая влажность',
            unit: '%',
            render: (value) => renderSensor('hum', value, '💧 Влажность', '%')
        },
        {
            name: 'allSettings',
            uuid: "beb5483e-36e1-4688-b7f5-ea07361b26a4",
            properties: ['read', 'write'],
            description: 'Все настройки',
            parser: parseSettings,
            render: (settings) => renderAllSettings(settings)
        },
        {
            name: 'sysInfo',
            uuid: "beb5483e-36e1-4688-b7f5-ea07361b26a5",
            properties: ['read', 'notify'],
            description: 'Системная информация',
            render: (value) => renderSysInfo(value)
        }
    ]
};

// 2. Фабрика для создания характеристик
class BLECharacteristicHandler {
    constructor(config) {
        this.config = config;
        this.value = null;
        this.element = null;
    }
    
    async read(characteristic) {
        const value = await characteristic.readValue();
        this.value = this.parse(value);
        return this.value;
    }
    
    async write(characteristic, value) {
        const encoder = new TextEncoder();
        await characteristic.writeValue(encoder.encode(value.toString()));
    }
    
    parse(value) {
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(value);
    }
    
    render(container, value) {
        if (this.config.render) {
            this.element = this.config.render(value);
            container.appendChild(this.element);
        }
    }
}

// 3. Генерация интерфейса из конфигурации
class BLEInterface {
    constructor(container) {
        this.container = container;
        this.handlers = new Map();
        this.initFromConfig();
    }
    
    initFromConfig() {
        // Создаем обработчики для каждой характеристики
        BLE_CONFIG.characteristics.forEach(char => {
            this.handlers.set(char.name, new BLECharacteristicHandler(char));
        });
        
        // Рендерим интерфейс
        this.renderInterface();
    }
    
    renderInterface() {
        // Группируем по типу
        const sensors = document.createElement('div');
        sensors.className = 'sensors-group';
        
        const settings = document.createElement('div');
        settings.className = 'settings-group';
        
        this.handlers.forEach((handler, name) => {
            const char = BLE_CONFIG.characteristics.find(c => c.name === name);
            
            if (char.properties.includes('notify')) {
                handler.render(sensors, null);
            } else {
                handler.render(settings, null);
            }
        });
        
        this.container.appendChild(sensors);
        this.container.appendChild(settings);
    }
    
    async updateCharacteristic(name, value) {
        const handler = this.handlers.get(name);
        const char = BLE_CONFIG.characteristics.find(c => c.name === name);
        
        if (char.properties.includes('write')) {
            // Находим BLE характеристику и пишем
            await handler.write(characteristics[name], value);
        }
    }
}

// 4. Расширение конфигурации - просто добавляем новые характеристики
function addNewSetting() {
    BLE_CONFIG.characteristics.push({
        name: 'waterHeaterTemp',
        uuid: "new-uuid-here", // Новый UUID
        properties: ['read', 'write'],
        description: 'Температура подогрева',
        unit: '°C',
        min: 20,
        max: 40,
        render: (value) => renderSlider('waterHeaterTemp', value, '🔥 Подогрев воды', '°C')
    });
    
    // Пересоздаем интерфейс
    location.reload(); // Или динамически обновить
}

// 5. Функции рендеринга
function renderSlider(name, value, label, unit) {
    const div = document.createElement('div');
    div.className = 'setting-item';
    div.innerHTML = `
        <label>${label}: <span id="${name}-value">${value}${unit}</span></label>
        <input type="range" id="${name}-slider" 
               min="${min}" max="${max}" value="${value}">
    `;
    return div;
}

function renderSensor(name, value, label, unit) {
    const div = document.createElement('div');
    div.className = 'sensor-card';
    div.id = `${name}-display`;
    div.innerHTML = `
        <div class="sensor-label">${label}</div>
        <div class="sensor-value">${value}${unit}</div>
    `;
    return div;
}

function renderAllSettings(settings) {
    const div = document.createElement('div');
    div.className = 'settings-card';
    div.innerHTML = '<h2>⚙️ Настройки</h2>';
    
    Object.entries(settings).forEach(([key, value]) => {
        const item = document.createElement('div');
        item.className = 'setting-row';
        item.innerHTML = `
            <span>${key}:</span>
            <span>${value}</span>
        `;
        div.appendChild(item);
    });
    
    return div;
}

function renderSysInfo(value) {
    const div = document.createElement('div');
    div.className = 'info-card';
    
    if (value.startsWith('E:')) {
        const eff = parseFloat(value.substring(2));
        div.innerHTML = `
            <div class="sensor-label">⚡ Эффективность</div>
            <div class="sensor-value">${eff.toFixed(1)}%/мин</div>
        `;
    }
    
    return div;
}

// 6. Парсер настроек (расширяемый)
function parseSettings(data) {
    const settings = {};
    const pairs = data.split(',');
    
    const parsers = {
        targetHumidity: (v) => parseInt(v),
        lockHoldTime: (v) => parseInt(v),
        waterHeaterEnabled: (v) => v === '1',
        waterHeaterMaxTemp: (v) => parseInt(v),
        deadZonePercent: (v) => parseFloat(v),
        // Добавляйте новые парсеры здесь
    };
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value && parsers[key]) {
            settings[key] = parsers[key](value);
        }
    });
    
    return settings;
}
