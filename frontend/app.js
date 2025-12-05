// Configuration
const API_BASE_URL = 'http://localhost:8000';
let authToken = null;
let autoSendInterval = null;

// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const dataForm = document.getElementById('dataForm');
const logoutBtn = document.getElementById('logoutBtn');
const currentUserSpan = document.getElementById('currentUser');
const autoSendCheckbox = document.getElementById('autoSend');

const riskCircle = document.getElementById('riskCircle');
const riskScore = document.getElementById('riskScore');
const riskMessage = document.getElementById('riskMessage');
const riskSubtitle = document.getElementById('riskSubtitle');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    const savedToken = localStorage.getItem('authToken');
    const savedUsername = localStorage.getItem('username');
    
    if (savedToken && savedUsername) {
        authToken = savedToken;
        showDashboard(savedUsername);
    }
    
    // Event listeners
    loginForm.addEventListener('submit', handleLogin);
    dataForm.addEventListener('submit', handleDataSubmit);
    logoutBtn.addEventListener('click', handleLogout);
    autoSendCheckbox.addEventListener('change', handleAutoSendToggle);
});

// Login Handler
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    showError('');
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Login fallito');
        }
        
        // Save token
        authToken = data.access_token;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('username', data.username);
        
        showDashboard(data.username);
        
    } catch (error) {
        showError(error.message);
        setConnectionStatus(false, error.message);
    }
}

// Logout Handler
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
    
    // Reset form
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
}

// Show Dashboard
function showDashboard(username) {
    currentUserSpan.textContent = `👤 ${username}`;
    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
    setConnectionStatus(true, 'Connesso');
}

// Handle Data Submit
async function handleDataSubmit(e) {
    e.preventDefault();
    await sendPredictionRequest();
}

// Send Prediction Request
async function sendPredictionRequest() {
    const data = {
        hrv: parseFloat(document.getElementById('hrv').value),
        heart_rate: parseInt(document.getElementById('heartRate').value),
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
            // Token expired
            handleLogout();
            showError('Sessione scaduta. Effettua nuovamente il login.');
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Errore nella predizione');
        }
        
        updateRiskDisplay(result);
        setConnectionStatus(true, 'Connesso');
        
    } catch (error) {
        console.error('Errore:', error);
        setConnectionStatus(false, 'Errore di connessione');
        
        // Retry after 3 seconds
        setTimeout(() => {
            if (authToken) {
                setConnectionStatus(true, 'Riprovo...');
            }
        }, 3000);
    }
}

// Update Risk Display
function updateRiskDisplay(prediction) {
    // Update score
    riskScore.textContent = (prediction.risk_score * 100).toFixed(0) + '%';
    
    // Update message
    riskMessage.textContent = prediction.message;
    
    // Update colors based on level
    riskCircle.className = 'risk-circle ' + prediction.risk_level;
    
    // Update subtitle with timestamp
    const time = new Date(prediction.timestamp).toLocaleTimeString('it-IT');
    riskSubtitle.textContent = `Ultimo aggiornamento: ${time}`;
    
    // Log for debugging
    console.log('Predizione:', prediction);
}

// Auto-send Toggle
function handleAutoSendToggle(e) {
    if (e.target.checked) {
        // Start auto-send
        autoSendInterval = setInterval(() => {
            sendPredictionRequest();
        }, 5000);
        
        // Send immediately
        sendPredictionRequest();
    } else {
        // Stop auto-send
        if (autoSendInterval) {
            clearInterval(autoSendInterval);
            autoSendInterval = null;
        }
    }
}

// Connection Status
function setConnectionStatus(connected, message) {
    statusDot.className = 'status-dot' + (connected ? '' : ' disconnected');
    statusText.textContent = message;
}

// Show Error
function showError(message) {
    if (message) {
        loginError.textContent = message;
        loginError.classList.add('show');
    } else {
        loginError.classList.remove('show');
    }
}

// Simulate random variation in data (optional - for testing)
function simulateDataVariation() {
    const hrv = document.getElementById('hrv');
    const heartRate = document.getElementById('heartRate');
    const movement = document.getElementById('movement');
    
    hrv.value = (parseFloat(hrv.value) + (Math.random() - 0.5) * 10).toFixed(1);
    heartRate.value = Math.round(parseFloat(heartRate.value) + (Math.random() - 0.5) * 5);
    movement.value = (parseFloat(movement.value) + (Math.random() - 0.5) * 20).toFixed(1);
}
