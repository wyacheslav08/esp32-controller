<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Guitar Cabinet Controller</title>
    <style>
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        max-width: 500px;
        margin: 0 auto;
        padding: 20px;
        background: #f5f5f5;
    }
    .container {
        background: white;
        border-radius: 20px;
        padding: 20px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 {
        color: #333;
        text-align: center;
        font-size: 24px;
        margin-bottom: 20px;
    }
    .status {
        background: #e3f2fd;
        padding: 15px;
        border-radius: 10px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .status-led {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #f44336;
        transition: background 0.3s;
    }
    .status-led-connected {
        background: #4caf50;
        animation: pulse 2s infinite;
    }
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
    #statusText {
        flex: 1;
    }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎸 Guitar Cabinet Controller</h1>
        <div class="status">
            <div class="status-led"></div>
            <span id="statusText">Ожидание подключения...</span>
        </div>
    </div>
    <script src="index.js"></script>
</body>
</html>
