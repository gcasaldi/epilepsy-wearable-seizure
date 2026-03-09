const TOKEN_KEY = 'authToken';
const API_BASE_STORAGE_KEY = 'epiguard_api_base';

const ROUTE_TO_PAGE = {
    '/': 'index.html',
    '/login': 'login.html',
    '/login/provider': 'login-provider.html',
    '/app': 'app-download.html',
    '/dashboard': 'dashboard.html',
    '/dashboard-v2': 'dashboard-v2.html',
    '/therapy': 'therapy.html',
    '/consents': 'consents.html',
    '/settings': 'settings.html',
    '/provider': 'provider.html',
    '/provider/dashboard': 'provider-dashboard.html',
    '/provider/patients': 'provider-patients.html',
    '/provider/invites': 'provider-invites.html',
    '/provider/audit': 'provider-audit.html',
    '/privacy': 'privacy.html',
    '/terms': 'terms.html',
    '/contact': 'contact.html',
    '/disclaimer': 'disclaimer.html',
};

function isGitHubPagesRuntime() {
    return window.location.hostname.endsWith('github.io');
}

function appBasePath() {
    if (!isGitHubPagesRuntime()) return '';
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (!parts.length) return '';

    // If app is served from /<repo>/frontend/*.html, keep both segments.
    if (parts.length >= 2 && parts[1] === 'frontend') {
        return `/${parts[0]}/${parts[1]}`;
    }

    return `/${parts[0]}`;
}

function normalizeBaseUrl(url) {
    if (!url) return '';
    return String(url).replace(/\/$/, '');
}

function readApiBaseFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get('api_base');
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) return '';
    return normalizeBaseUrl(value);
}

function resolveApiBase() {
    const queryValue = readApiBaseFromQuery();
    if (queryValue) {
        localStorage.setItem(API_BASE_STORAGE_KEY, queryValue);
        return queryValue;
    }

    const stored = normalizeBaseUrl(localStorage.getItem(API_BASE_STORAGE_KEY) || '');
    if (stored && /^https?:\/\//i.test(stored)) {
        return stored;
    }

    return normalizeBaseUrl(window.location.origin);
}

function appPath(route) {
    if (!isGitHubPagesRuntime()) return route;
    const base = appBasePath();
    const page = ROUTE_TO_PAGE[route] || ROUTE_TO_PAGE['/'];
    return `${base}/${page}`;
}

function goTo(route) {
    window.location.href = appPath(route);
}

function patchInternalLinks() {
    document.querySelectorAll('a[href^="/"]').forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (!href) return;

        if (href === LOCAL_APK_PATH) {
            anchor.href = `${API_BASE}${LOCAL_APK_PATH}`;
            return;
        }

        if (ROUTE_TO_PAGE[href]) {
            anchor.href = appPath(href);
        }
    });
}

const API_BASE = resolveApiBase();

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
    const headers = options.headers || {};
    const token = getToken();
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : {};

    if (!response.ok) {
        throw new Error(payload.message || payload.detail || `Errore ${response.status}`);
    }

    return payload;
}

async function loadProfile() {
    try {
        return await api('/api/me');
    } catch {
        return null;
    }
}

function updateNav(profile) {
    const loginBtn = document.querySelector('[data-nav-login]');
    const logoutBtn = document.querySelector('[data-nav-logout]');
    const userBadge = document.querySelector('[data-user-badge]');

    if (profile) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (userBadge) {
            userBadge.classList.remove('hidden');
            userBadge.textContent = profile.username;
        }
    } else {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (userBadge) userBadge.classList.add('hidden');
    }
}

function bindLogout() {
    const logoutBtn = document.querySelector('[data-nav-logout]');
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', () => {
        clearSession();
        goTo('/login');
    });
}

function showError(el, message) {
    if (!el) return;
    if (!message) {
        el.classList.remove('show');
        el.textContent = '';
        return;
    }
    el.textContent = message;
    el.classList.add('show');
}

function providerModeLabel(mode) {
    if (mode === 'oauth') return 'OAuth';
    if (mode === 'bridge') return 'Bridge app';
    if (mode === 'legacy') return 'Legacy';
    return mode || 'N/D';
}

function providerStatusTag(item) {
    if (item.connected) {
        return '<span class="tag tag-success">Collegato</span>';
    }
    return '<span class="tag">Non collegato</span>';
}

async function renderWearableProviders() {
    const summaryEl = document.getElementById('wearableSummary');
    const container = document.getElementById('wearableProviders');
    if (!summaryEl || !container) return;

    try {
        const providers = await api('/api/wearable/providers');
        summaryEl.textContent = `${providers.connected} su ${providers.total} provider collegati.`;

        container.innerHTML = providers.items.map((item) => {
            const connectAction = item.connected
                ? `<button class="btn btn-outline" data-provider-disconnect="${item.provider_key}">Disconnetti</button>`
                : `<button class="btn" data-provider-connect="${item.provider_key}" data-provider-mode="${item.supported_mode === 'oauth' ? 'oauth' : 'demo'}">Collega</button>`;

            const oauthHelp = item.supported_mode === 'oauth'
                ? '<p class="muted">Modalita`: OAuth diretto (attiva con credenziali provider).</p>'
                : '<p class="muted">Modalita`: bridge/app companion.</p>';

            return `
                <article class="card">
                    <h3>${item.provider_name}</h3>
                    <p class="muted">Categoria: ${item.category} · Integrazione: ${providerModeLabel(item.supported_mode)}</p>
                    <p>${providerStatusTag(item)}</p>
                    ${oauthHelp}
                    ${connectAction}
                </article>
            `;
        }).join('');

        container.querySelectorAll('[data-provider-connect]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const providerKey = btn.getAttribute('data-provider-connect');
                const mode = btn.getAttribute('data-provider-mode') || 'demo';
                try {
                    const result = await api(`/api/wearable/connect/${providerKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            mode,
                            redirect_uri: `${window.location.origin}/settings`,
                        }),
                    });

                    if (result.status === 'pending_oauth' && result.auth_url) {
                        const proceed = confirm('Provider pronto in OAuth. Vuoi aprire il link autorizzazione?');
                        if (proceed) {
                            window.open(result.auth_url, '_blank', 'noopener');
                        }
                    } else {
                        alert(result.message || 'Provider collegato');
                    }

                    await renderWearableProviders();
                } catch (err) {
                    alert(err.message);
                }
            });
        });

        container.querySelectorAll('[data-provider-disconnect]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const providerKey = btn.getAttribute('data-provider-disconnect');
                try {
                    const result = await api(`/api/wearable/connect/${providerKey}`, {
                        method: 'DELETE',
                    });
                    alert(result.message || 'Provider disconnesso');
                    await renderWearableProviders();
                } catch (err) {
                    alert(err.message);
                }
            });
        });
    } catch (err) {
        summaryEl.textContent = 'Impossibile caricare i provider wearable.';
        container.innerHTML = '<article class="card"><p class="muted">Errore nel caricamento integrazioni.</p></article>';
        console.error(err);
    }
}

async function initGoogleButton(targetId, onCredential) {
    const box = document.getElementById(targetId);
    if (!box) return;

    const response = await fetch(`${API_BASE}/auth/google-config`);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
        throw new Error(`Impossibile caricare config Google (${response.status}). Verifica api_base.`);
    }
    if (!contentType.includes('application/json')) {
        throw new Error('Risposta non valida dal backend (atteso JSON). Probabile api_base non corretto.');
    }
    const config = await response.json();
    if (!config.enabled || !config.google_client_id) {
        throw new Error('Google Sign-In non configurato: imposta GOOGLE_CLIENT_ID nel backend (.env) e riavvia il server.');
    }

    const waitGoogle = () => new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            if (window.google && window.google.accounts && window.google.accounts.id) {
                resolve();
            } else {
                attempts += 1;
                if (attempts > 40) {
                    reject(new Error('SDK Google non disponibile: verifica connessione internet o blocchi di rete.'));
                    return;
                }
                setTimeout(check, 250);
            }
        };
        check();
    });

    await waitGoogle();

    window.google.accounts.id.initialize({
        client_id: config.google_client_id,
        callback: onCredential,
        auto_select: false,
    });

    window.google.accounts.id.renderButton(box, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 280,
    });
}

async function loginWithGoogle(credential) {
    const result = await api('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
    });
    setToken(result.access_token);
    return result;
}

async function requireAuth(allowedTypes = []) {
    const profile = await loadProfile();
    if (!profile) {
        goTo('/login');
        return null;
    }

    if (allowedTypes.length && !allowedTypes.includes(profile.account_type)) {
        if (profile.account_type === 'provider') {
            goTo('/provider');
        } else {
            goTo('/dashboard');
        }
        return null;
    }

    updateNav(profile);
    return profile;
}

async function requireVerifiedProvider() {
    const profile = await requireAuth(['provider']);
    if (!profile) return null;

    const provider = await api('/api/provider/status');
    if (!provider.verified) {
        goTo('/provider');
        return null;
    }

    return { profile, provider };
}

function isMobileBrowser() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const IOS_STORE_URL = 'https://apps.apple.com/';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.epilepsy.wearmonitor';
const ANDROID_SEARCH_URL = 'https://play.google.com/store/search?q=epilepsy%20wear%20monitor&c=apps';
const LOCAL_APK_PATH = '/app/apk';

function qrImageUrl(targetUrl) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(targetUrl)}`;
}

function localApkUrl() {
    return `${API_BASE}${LOCAL_APK_PATH}`;
}

function appStoreUrl() {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        return IOS_STORE_URL;
    }
    return ANDROID_STORE_URL;
}

function computeDemoRisk(payload) {
    const hrv = Number(payload.hrv);
    const heartRate = Number(payload.heart_rate);
    const movement = Number(payload.movement);
    const sleepHours = Number(payload.sleep_hours);
    const medicationTaken = Boolean(payload.medication_taken);

    const hrvRisk = Math.max(0, Math.min(1, (60 - hrv) / 60));
    const hrRisk = Math.max(0, Math.min(1, Math.abs(heartRate - 72) / 50));
    const movementRisk = Math.max(0, Math.min(1, (80 - movement) / 120));
    const sleepRisk = Math.max(0, Math.min(1, (7 - sleepHours) / 7));
    const medicationRisk = medicationTaken ? 0 : 1;

    const score = (
        0.25 * hrvRisk +
        0.20 * hrRisk +
        0.15 * movementRisk +
        0.25 * sleepRisk +
        0.15 * medicationRisk
    );

    let level = 'low';
    let message = 'Rischio basso: andamento attuale stabile.';
    if (score >= 0.67) {
        level = 'high';
        message = 'Rischio elevato: valuta monitoraggio ravvicinato e piano sicurezza.';
    } else if (score >= 0.34) {
        level = 'medium';
        message = 'Rischio moderato: controlla sonno, stress e aderenza terapeutica.';
    }

    return {
        risk_score: Math.max(0, Math.min(1, score)),
        risk_level: level,
        message,
    };
}

function renderDemoRisk(result) {
    const scoreEl = document.getElementById('demoRiskScore');
    const levelEl = document.getElementById('demoRiskLevel');
    const msgEl = document.getElementById('demoRiskMessage');
    if (!scoreEl || !levelEl || !msgEl) return;

    const pct = `${(result.risk_score * 100).toFixed(1)}%`;
    scoreEl.textContent = pct;
    scoreEl.classList.remove('risk-low', 'risk-medium', 'risk-high');
    scoreEl.classList.add(`risk-${result.risk_level}`);
    levelEl.textContent = `Livello: ${result.risk_level.toUpperCase()}`;
    msgEl.textContent = result.message;
}

async function initLandingDemo() {
    const apiLabel = document.getElementById('apiBaseLabel');
    const healthEl = document.getElementById('apiHealthStatus');
    if (apiLabel) {
        apiLabel.textContent = API_BASE;
    }

    if (healthEl) {
        try {
            const resp = await fetch(`${API_BASE}/health`);
            if (resp.ok) {
                healthEl.textContent = 'Backend raggiungibile: pronto per integrazione reale.';
            } else {
                healthEl.textContent = 'Backend non raggiungibile (usa ?api_base=https://tuo-backend).';
            }
        } catch {
            healthEl.textContent = 'Backend non raggiungibile (usa ?api_base=https://tuo-backend).';
        }
    }

    const form = document.getElementById('demoRiskForm');
    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const payload = {
                hrv: Number(document.getElementById('demoHrv').value),
                heart_rate: Number(document.getElementById('demoHr').value),
                movement: Number(document.getElementById('demoMovement').value),
                sleep_hours: Number(document.getElementById('demoSleep').value),
                medication_taken: document.getElementById('demoMedication').value === 'true',
            };

            renderDemoRisk(computeDemoRisk(payload));
        });
    }

    const watchBtn = document.getElementById('demoConnectWatchBtn');
    const watchStatus = document.getElementById('demoWatchStatus');
    if (watchBtn && watchStatus) {
        watchBtn.addEventListener('click', async () => {
            if (!navigator.bluetooth) {
                watchStatus.textContent = 'Web Bluetooth non supportato su questo browser/dispositivo.';
                return;
            }

            try {
                watchStatus.textContent = 'Ricerca smartwatch...';
                const device = await navigator.bluetooth.requestDevice({
                    filters: [{ services: ['heart_rate'] }],
                    optionalServices: ['battery_service'],
                });
                watchStatus.textContent = `Smartwatch collegato: ${device.name || 'dispositivo BLE'}.`;
            } catch (err) {
                watchStatus.textContent = `Connessione annullata/non riuscita: ${err.message}`;
            }
        });
    }
}

async function boot() {
    bindLogout();
    patchInternalLinks();
    const page = document.body.dataset.page;
    const profile = await loadProfile();
    updateNav(profile);

    if (page === 'landing') {
        await initLandingDemo();
    }

    if (page === 'login') {
        const error = document.getElementById('loginError');
        const apiBaseInfo = document.getElementById('loginApiBase');
        if (apiBaseInfo) {
            apiBaseInfo.textContent = API_BASE;
        }

        try {
            await initGoogleButton('googlePatientButton', async (response) => {
                try {
                    await loginWithGoogle(response.credential);
                    goTo('/dashboard');
                } catch (err) {
                    showError(error, err.message);
                }
            });
        } catch (err) {
            showError(error, err.message || 'Google Sign-In non disponibile');
        }

        const patientForm = document.getElementById('patientLocalLoginForm');
        if (patientForm) {
            patientForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError(error, '');
                const username = document.getElementById('patientUsername').value;
                const password = document.getElementById('patientPassword').value;
                try {
                    const res = await api('/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password }),
                    });
                    setToken(res.access_token);
                    goTo('/dashboard');
                } catch (err) {
                    showError(error, err.message || 'Login locale non riuscito');
                }
            });
        }

        const registerForm = document.getElementById('patientRegisterForm');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError(error, '');
                const email = document.getElementById('registerEmail').value.trim();
                const password = document.getElementById('registerPassword').value;

                try {
                    const res = await api('/auth/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password }),
                    });
                    setToken(res.access_token);
                    goTo('/dashboard');
                } catch (err) {
                    showError(error, err.message || 'Registrazione non riuscita');
                }
            });
        }
    }

    if (page === 'login-provider') {
        const error = document.getElementById('providerLoginError');
        try {
            await initGoogleButton('googleProviderButton', async (response) => {
                try {
                    await loginWithGoogle(response.credential);
                    const status = await api('/api/provider/status');
                    goTo(status.verified ? '/provider/dashboard' : '/provider');
                } catch (err) {
                    showError(error, err.message);
                }
            });
        } catch (err) {
            showError(error, err.message || 'Google Sign-In non disponibile');
        }

        const form = document.getElementById('providerLocalLoginForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError(error, '');
                const username = document.getElementById('providerUsername').value;
                const password = document.getElementById('providerPassword').value;
                try {
                    const res = await api('/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password }),
                    });
                    setToken(res.access_token);
                    const status = await api('/api/provider/status');
                    goTo(status.verified ? '/provider/dashboard' : '/provider');
                } catch (err) {
                    showError(error, err.message);
                }
            });
        }
    }

    if (page === 'app-download') {
        const iosStoreLink = document.getElementById('iosStoreLink');
        if (iosStoreLink) {
            iosStoreLink.href = IOS_STORE_URL;
        }

        const androidStoreLink = document.getElementById('androidStoreLink');
        if (androidStoreLink) {
            androidStoreLink.href = ANDROID_STORE_URL;
        }

        const playSearchLink = document.getElementById('playSearchLink');
        if (playSearchLink) {
            playSearchLink.href = ANDROID_SEARCH_URL;
        }

        const apkDownloadLink = document.getElementById('apkDownloadLink');
        if (apkDownloadLink) {
            apkDownloadLink.href = `${API_BASE}${LOCAL_APK_PATH}`;
        }

        const storeLink = document.getElementById('smartStoreLink');
        if (storeLink) {
            storeLink.href = appStoreUrl();
        }

        const qrImage = document.getElementById('appQrImage');
        if (qrImage) {
            qrImage.src = qrImageUrl(localApkUrl());
        }

        const apkQrHint = document.getElementById('apkQrHint');
        if (apkQrHint && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            apkQrHint.textContent = 'Per scansione da telefono usa l\'IP LAN del PC (es. http://192.168.x.x:8000/app).';
        }

        if (isMobileBrowser()) {
            const mobileNotice = document.getElementById('mobileRedirectNotice');
            if (mobileNotice) mobileNotice.classList.remove('hidden');
            setTimeout(() => {
                window.location.href = appStoreUrl();
            }, 1200);
        }
    }

    if (page === 'dashboard') {
        const user = await requireAuth(['personal']);
        if (!user) return;
        document.getElementById('patientWelcome').textContent = user.username;

        try {
            const prediction = await api('/api/test');
            document.getElementById('lastRisk').textContent = prediction.output.risk_level.toUpperCase();
            document.getElementById('lastMessage').textContent = prediction.output.message;
        } catch {
            document.getElementById('lastRisk').textContent = 'N/D';
        }
    }

    if (page === 'consents') {
        const user = await requireAuth(['personal']);
        if (!user) return;
        document.getElementById('consentsUser').textContent = user.username;
        const list = document.getElementById('consentsList');

        try {
            const data = await api('/api/consents');
            if (!data.count) {
                list.innerHTML = '<div class="card"><p class="muted">Nessun ente collegato al momento.</p></div>';
            } else {
                list.innerHTML = data.items.map((item) => `
                    <div class="card">
                        <h3>${item.organization_name}</h3>
                        <p class="muted">Scope: ${JSON.stringify(item.scope)}</p>
                        <p class="muted">Versione consenso: ${item.version}</p>
                        <button class="btn btn-outline" disabled>Revoca immediata (attiva lato API dedicata)</button>
                    </div>
                `).join('');
            }
        } catch {
            list.innerHTML = '<div class="card"><p class="muted">Impossibile caricare i consensi.</p></div>';
        }
    }

    if (page === 'settings') {
        const user = await requireAuth(['personal', 'provider']);
        if (!user) return;
        document.getElementById('settingsUser').textContent = user.username;
        document.getElementById('settingsType').textContent = user.account_type;

        const deleteBtn = document.getElementById('deleteAccountBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (!confirm('Confermi la cancellazione account con revoca consensi?')) return;
                try {
                    await api('/api/account', { method: 'DELETE' });
                    clearSession();
                    goTo('/login');
                } catch (err) {
                    alert(err.message);
                }
            });
        }

        await renderWearableProviders();
    }

    if (page === 'provider-gate') {
        const user = await requireAuth(['provider']);
        if (!user) return;

        const status = await api('/api/provider/status');
        const verified = document.getElementById('providerVerified');
        const pending = document.getElementById('providerPending');
        const denied = document.getElementById('providerDenied');

        if (status.verified) {
            verified.classList.remove('hidden');
            setTimeout(() => {
                goTo('/provider/dashboard');
            }, 700);
        } else if (status.provider_status === 'provider_pending') {
            pending.classList.remove('hidden');
        } else {
            denied.classList.remove('hidden');
        }
    }

    if (['provider-dashboard', 'provider-patients', 'provider-invites', 'provider-audit'].includes(page)) {
        const ctx = await requireVerifiedProvider();
        if (!ctx) return;

        const orgNameEls = document.querySelectorAll('[data-org-name]');
        orgNameEls.forEach((el) => {
            el.textContent = ctx.provider.organization?.legal_name || 'Ente verificato';
        });

        if (page === 'provider-patients') {
            const body = document.getElementById('patientsBody');
            body.innerHTML = '<tr><td>Demo paziente</td><td><span class="tag tag-success">Consenso attivo</span></td><td>Trend disponibile</td></tr>';
        }

        if (page === 'provider-invites') {
            const codeBox = document.getElementById('inviteCode');
            const qrStatus = document.getElementById('qrStatus');
            const genBtn = document.getElementById('generateInviteBtn');
            genBtn.addEventListener('click', () => {
                const code = `EPI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
                codeBox.textContent = code;
                qrStatus.textContent = 'Invito generato (demo) e tracciato in audit.';
            });
        }

        if (page === 'provider-audit') {
            const logs = document.getElementById('auditLogs');
            logs.innerHTML = `
                <tr><td>CONSENT_GRANTED</td><td>patient:demo</td><td>Oggi</td></tr>
                <tr><td>EXPORT_REQUESTED</td><td>report:weekly</td><td>Oggi</td></tr>
                <tr><td>INVITE_GENERATED</td><td>invite:qr</td><td>Oggi</td></tr>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', boot);
