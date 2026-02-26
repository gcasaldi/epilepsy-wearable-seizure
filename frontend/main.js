document.addEventListener('DOMContentLoaded', () => {
    // --- Authentication Check ---
    if (sessionStorage.getItem('userIsAuthenticated') !== 'true') {
        window.location.href = 'index.html';
        return; // Stop script execution if not authenticated
    }

    // --- Elements & Config ---
    const languageSelect = document.getElementById('language-select');
    const connectButton = document.getElementById('connect-button');
    const logoutButton = document.getElementById('logout-button');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const aiInsights = document.getElementById('ai-insights');
    const therapyForm = document.getElementById('therapy-form');
    const medicationNameInput = document.getElementById('medication-name');
    const medicationList = document.getElementById('medication-list');
    const chartCtx = document.getElementById('telemetryChart').getContext('2d');

    // --- Translations ---
    const translations = {
        en: {
            // ... (all previous keys are the same)
            bluetooth_error_message: 'Web Bluetooth is not supported on this browser or device. Please use Google Chrome on a desktop or Android device, and ensure you are on a secure (https) connection. It does not work on iOS.'
        },
        it: {
            // ... (all previous keys are the same)
            bluetooth_error_message: 'Web Bluetooth non è supportato da questo browser o dispositivo. Per favore, usa Google Chrome su un computer o un dispositivo Android e assicurati di essere su una connessione sicura (https). Non funziona su iOS.'
        }
    };

    // --- App Logic ---
    logoutButton.addEventListener('click', () => {
        sessionStorage.removeItem('userIsAuthenticated');
        window.location.href = 'index.html';
    });

    connectButton.addEventListener('click', onConnectClick);

    async function onConnectClick() {
        const lang = languageSelect.value;
        if (!navigator.bluetooth) {
            alert(translations[lang].bluetooth_error_message);
            return;
        }

        try {
            // DIAGNOSTIC CHANGE: Accept all devices to find the watch,
            // but keep 'heart_rate' as an optional service to be able to use it.
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['heart_rate'] 
            });
            
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService('heart_rate');
            const characteristic = await service.getCharacteristic('heart_rate_measurement');
            await characteristic.startNotifications();

            characteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
            
            statusIndicator.className = 'connected';
            statusText.textContent = `${translations[lang].connected} ${device.name || 'device'}`;
            connectButton.disabled = true;
            logoutButton.disabled = true; // Disable logout while connected

        } catch (error) {
            console.error('Bluetooth connection error:', error);
            statusIndicator.className = 'disconnected';
            statusText.textContent = translations[lang].disconnected;
        }
    }
    
    function handleCharacteristicValueChanged(event) {
        const value = event.target.value;
        const flags = value.getUint8(0);
        const rate16Bits = flags & 0x1;
        const heartRate = rate16Bits ? value.getUint16(1, true) : value.getUint8(1);
        const simulatedHrv = Math.floor(Math.random() * (80 - 40 + 1)) + 40;

        const telemetry = { heart_rate: heartRate, hrv: simulatedHrv };
        
        const now = new Date();
        const timeLabel = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
        addDataToChart(telemetryChart, timeLabel, telemetry);
    }

    // ... (rest of the functions: addDataToChart, updateLanguage, Chart object, etc. remain the same)
    // For brevity, they are not repeated here.
    const telemetryChart = new Chart(chartCtx, {
        type: 'line',
        data: { labels: [], datasets: [/* ... */] },
        options: { /* ... */ }
    });

    function addDataToChart(chart, label, telemetry) {
        if (chart.data.labels.length > 50) {
            chart.data.labels.shift();
            chart.data.datasets.forEach(d => d.data.shift());
        }
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(telemetry.heart_rate);
        chart.data.datasets[1].data.push(telemetry.hrv);
        chart.update();
    }

    function updateLanguage(lang) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                el.textContent = translations[lang][key];
            }
        });
    }

    languageSelect.addEventListener('change', (e) => updateLanguage(e.target.value));
    updateLanguage(languageSelect.value);
});