function parseAndDisplaySettings(data) {
    let element = document.getElementById('settings-display');
    
    if (!element) {
        element = document.createElement('div');
        element.id = 'settings-display';
        element.className = 'settings-card';
        
        const effDisplay = document.getElementById('eff-display');
        if (effDisplay) {
            effDisplay.parentNode.insertBefore(element, effDisplay.nextSibling);
        } else {
            document.querySelector('.container').appendChild(element);
        }
    }
    
    // Парсим настройки
    const settings = {};
    const pairs = data.split(',');
    
    pairs.forEach(pair => {
        const [key, value] = pair.split('=');
        if (key && value) {
            settings[key.trim()] = value.trim();
        }
    });
    
    log('📊 Получены настройки:', settings);
    
    let html = '<h2>⚙️ Настройки</h2>';
    
    // Основные настройки
    if (settings.targetHumidity) {
        html += `
            <div class="setting-item">
                <label>🎯 Целевая влажность: <span id="target-hum-value">${settings.targetHumidity}%</span></label>
                <input type="range" id="target-hum-slider" min="0" max="100" value="${settings.targetHumidity}">
            </div>
        `;
    }
    
    if (settings.lockHoldTime) {
        html += `
            <div class="setting-item">
                <label>🔒 Время удержания замка:</label>
                <span>${settings.lockHoldTime} мс</span>
            </div>
        `;
    }
    
    // Звуковые настройки
    html += '<div class="setting-item"><label>🔊 Звуковые оповещения:</label>';
    if (settings.doorSoundEnabled !== undefined) {
        html += `<div>🚪 Дверь: <span class="${settings.doorSoundEnabled === '1' ? 'status-on' : 'status-off'}">${settings.doorSoundEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    if (settings.waterSilicaSoundEnabled !== undefined) {
        html += `<div>💧 Ресурсы: <span class="${settings.waterSilicaSoundEnabled === '1' ? 'status-on' : 'status-off'}">${settings.waterSilicaSoundEnabled === '1' ? 'ВКЛ' : 'ВЫКЛ'}</span></div>`;
    }
    html += '</div>';
    
    // Подогрев воды
    if (settings.waterHeaterEnabled !== undefined) {
        html += `
            <div class="setting-item">
                <label>💧 Подогрев воды:</label>
                <div>Статус: <span class="${settings.waterHeaterEnabled === '1' ? 'status-on' : 'status-off'}">${settings.waterHeaterEnabled === '1' ? 'ВКЛ 🔥' : 'ВЫКЛ ❄️'}</span></div>
        `;
        if (settings.waterHeaterMaxTemp) {
            html += `<div>Макс. температура: ${settings.waterHeaterMaxTemp}°C</div>`;
        }
        html += '</div>';
    }
    
    // Таймауты
    html += '<div class="setting-item"><label>⏱️ Таймауты:</label>';
    
    const lockTimeNames = ["ОТКЛ", "30 сек", "1 мин", "2 мин", "5 мин"];
    if (settings.lockTimeIndex !== undefined) {
        const index = parseInt(settings.lockTimeIndex);
        html += `<div>🔐 Блокировка: ${lockTimeNames[index] || settings.lockTimeIndex}</div>`;
    }
    
    const menuTimeoutNames = ["ОТКЛ", "15 сек", "30 сек", "1 мин", "2 мин"];
    if (settings.menuTimeoutOptionIndex !== undefined) {
        const index = parseInt(settings.menuTimeoutOptionIndex);
        html += `<div>📱 Меню: ${menuTimeoutNames[index] || settings.menuTimeoutOptionIndex}</div>`;
    }
    
    const screenTimeoutNames = ["ОТКЛ", "30 сек", "1 мин", "5 мин", "10 мин"];
    if (settings.screenTimeoutOptionIndex !== undefined) {
        const index = parseInt(settings.screenTimeoutOptionIndex);
        html += `<div>🖥️ Экран: ${screenTimeoutNames[index] || settings.screenTimeoutOptionIndex}</div>`;
    }
    html += '</div>';
    
    // Логика влажности
    html += '<div class="setting-item"><label>💧 Логика влажности:</label>';
    if (settings.deadZonePercent) {
        html += `<div>📊 Мертвая зона: ${parseFloat(settings.deadZonePercent).toFixed(1)}%</div>`;
    }
    if (settings.minHumidityChange) {
        html += `<div>📈 Мин. изменение: ${parseFloat(settings.minHumidityChange).toFixed(1)}%</div>`;
    }
    if (settings.maxOperationDuration) {
        html += `<div>⏱️ Макс. время: ${settings.maxOperationDuration} мин</div>`;
    }
    if (settings.operationCooldown) {
        html += `<div>😴 Отдых: ${settings.operationCooldown} мин</div>`;
    }
    if (settings.maxSafeHumidity) {
        html += `<div>⚠️ Макс. безопасная: ${settings.maxSafeHumidity}%</div>`;
    }
    if (settings.resourceCheckDiff) {
        html += `<div>🔄 Порог ресурса: ${settings.resourceCheckDiff}%</div>`;
    }
    if (settings.hysteresis) {
        html += `<div>📉 Гистерезис: ${parseFloat(settings.hysteresis).toFixed(1)}%</div>`;
    }
    if (settings.lowFaultThreshold) {
        html += `<div>⚠️ Порог "Мало": ${settings.lowFaultThreshold}</div>`;
    }
    if (settings.emptyFaultThreshold) {
        html += `<div>⛔ Порог "Нет": ${settings.emptyFaultThreshold}</div>`;
    }
    html += '</div>';
    
    // Счетчики
    html += '<div class="setting-item"><label>📊 Статистика:</label>';
    if (settings.rebootCounter) {
        html += `<div>🔄 Перезагрузок: ${settings.rebootCounter}</div>`;
    }
    if (settings.wdtResetCount) {
        html += `<div>🐕 WDT сбросов: ${settings.wdtResetCount}</div>`;
    }
    html += '</div>';
    
    // Добавляем кнопку "Сохранить все"
    html += `
        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button id="save-all-settings" class="connect-btn" style="background: #4caf50; flex: 2;">💾 Сохранить все настройки</button>
            <button id="refresh-settings" class="connect-btn" style="background: #2196f3; flex: 1;">🔄</button>
        </div>
    `;
    
    element.innerHTML = html;
    
    // Добавляем обработчики
    setupSettingsHandlers(settings);
}
