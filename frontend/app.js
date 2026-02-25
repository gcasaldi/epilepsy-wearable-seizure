// Configuration
const API_BASE_URL = 'http://localhost:8000';
let authToken = null;
let autoSendInterval = null;
let googleClientId = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginError = document.getElementById('loginError');
const dataForm = document.getElementById('dataForm');
const logoutBtn = document.getElementById('logoutBtn');
const currentUserSpan = document.getElementById('currentUser');
const autoSendCheckbox = document.getElementById('autoSend');
const googleSigninContainer = document.getElementById('googleSigninContainer');

const riskCircle = document.getElementById('riskCircle');
const riskScore = document.getElementById('riskScore');
const riskMessage = document.getElementById('riskMessage');
const riskSubtitle = document.getElementById('riskSubtitle');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const savedToken = localStorage.getItem('authToken');
    const savedUsername = localStorage.getItem('username');

    if (savedToken && savedUsername) {
        authToken = savedToken;
        showDashboard(savedUsername);
    }

    dataForm.addEventListener('submit', handleDataSubmit);
    logoutBtn.addEventListener('click', handleLogout);
    autoSendCheckbox.addEventListener('change', handleAutoSendToggle);

    await setupGoogleSignIn();
});

async function setupGoogleSignIn() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/google-config`);
        const config = await response.json();

        if (!response.ok || !config.enabled || !config.google_client_id) {
            throw new Error('Google Sign-In non configurato sul server');
        }

        googleClientId = config.google_client_id;

        if (!window.google || !window.google.accounts || !window.google.accounts.id) {
            setTimeout(setupGoogleSignIn, 500);
            return;
        }

        window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredential,
            auto_select: false,
            cancel_on_tap_outside: true
        });

        window.google.accounts.id.renderButton(googleSigninContainer, {
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            width: 280
        });
    } catch (error) {
        showError(error.message || 'Errore inizializzazione Google Sign-In');
    }
}

async function handleGoogleCredential(googleResponse) {
    showError('');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/google`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ credential: googleResponse.credential })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Accesso Google fallito');
        }

        authToken = data.access_token;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('username', data.username);

        showDashboard(data.username);
    } catch (error) {
        showError(error.message);
        setConnectionStatus(false, error.message);
    }
}

function handleLogout() {
    authToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');

    if (autoSendInterval) {
        clearInterval(autoSendInterval);
        autoSendInterval = null;
        autoSendCheckbox.checked = false;
    }

    loginScreen.classList.add('active');
    dashboardScreen.classList.remove('active');
    setConnectionStatus(true, 'Disconnesso');
}

function showDashboard(username) {
    currentUserSpan.textContent = `👤 ${username}`;
    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
    setConnectionStatus(true, 'Connesso');
}

async function handleDataSubmit(e) {
    e.preventDefault();
    await sendPredictionRequest();
}

async function sendPredictionRequest() {
    const data = {
        hrv: parseFloat(document.getElementById('hrv').value),
        heart_rate: parseInt(document.getElementById('heartRate').value, 10),
        movement: parseFloat(document.getElementById('movement').value),
        sleep_hours: parseFloat(document.getElementById('sleepHours').value),
        medication_taken: document.getElementById('medicationTaken').checked
    };

    try {
        setConnectionStatus(true, 'Invio dati...');

        const response = await fetch(`${API_BASE_URL}/api/predict`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        if (response.status === 401) {
            handleLogout();
            showError('Sessione scaduta. Effettua nuovamente l\'accesso Google.');
            return;
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Errore nella predizione');
        }

        updateRiskDisplay(result);
        setConnectionStatus(true, 'Connesso');
    } catch (error) {
        setConnectionStatus(false, 'Errore di connessione');
        console.error('Errore predizione:', error);
    }
}

function updateRiskDisplay(prediction) {
    riskScore.textContent = `${(prediction.risk_score * 100).toFixed(0)}%`;
    riskMessage.textContent = prediction.message;
    riskCircle.className = `risk-circle ${prediction.risk_level}`;
    const time = new Date(prediction.timestamp).toLocaleTimeString('it-IT');
    riskSubtitle.textContent = `Ultimo aggiornamento: ${time}`;
}

function handleAutoSendToggle(e) {
    if (e.target.checked) {
        autoSendInterval = setInterval(() => {
            sendPredictionRequest();
        }, 5000);
        sendPredictionRequest();
    } else if (autoSendInterval) {
        clearInterval(autoSendInterval);
        autoSendInterval = null;
    }
}

function setConnectionStatus(connected, message) {
    statusDot.className = `status-dot${connected ? '' : ' disconnected'}`;
    statusText.textContent = message;
}

function showError(message) {
    if (!message) {
        loginError.classList.remove('show');
        loginError.textContent = '';
        return;
    }

    loginError.textContent = message;
    loginError.classList.add('show');
}