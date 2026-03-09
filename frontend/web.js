const TOKEN_KEY = 'authToken';
const API_BASE_STORAGE_KEY = 'epiguard_api_base';
const LOCAL_USERS_KEY = 'epiguard_local_users';

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
let riskChart = null;
const reminderTimers = {};

function isStaticPagesApiBase() {
    return API_BASE.includes('github.io');
}

function parseJsonBody(body) {
    if (!body) return {};
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }
    return body;
}

function getLocalUsers() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '[]');
    } catch {
        return [];
    }
}

function setLocalUsers(users) {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function makeLocalToken(profile) {
    return `local.${btoa(JSON.stringify(profile))}`;
}

function getLocalProfileFromToken() {
    const token = getToken();
    if (!token || !token.startsWith('local.')) return null;
    const encoded = token.split('.', 2)[1];
    try {
        return JSON.parse(atob(encoded));
    } catch {
        return null;
    }
}

function userScopedKey(email, suffix) {
    return `epiguard_${suffix}_${email}`;
}

function readJsonStorage(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function writeJsonStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

async function localApiFallback(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const payload = parseJsonBody(options.body);

    const providerDemoEmail = 'demo.ente@epilepsy.local';
    const providerDemoPass = 'DemoEnte2026!';
    const patientDemoEmail = 'demo.user@epilepsy.local';
    const patientDemoPass = 'DemoUser2026!';

    if (path === '/auth/register' && method === 'POST') {
        const email = String(payload.email || '').trim().toLowerCase();
        const password = String(payload.password || '');
        if (!email || !email.includes('@')) {
            throw new Error('Email non valida');
        }
        if (password.length < 8) {
            throw new Error('Password troppo corta (min 8 caratteri)');
        }

        const users = getLocalUsers();
        if (users.some((u) => u.email === email)) {
            throw new Error("Account gia' registrato");
        }

        users.push({ email, password, account_type: 'personal', created_at: new Date().toISOString() });
        setLocalUsers(users);
        const profile = { email, account_type: 'personal', provider_status: null };
        return {
            access_token: makeLocalToken(profile),
            token_type: 'bearer',
            expires_in: 60 * 60 * 24,
            username: email,
            mode: 'local-pages-fallback',
        };
    }

    if (path === '/auth/login' && method === 'POST') {
        const username = String(payload.username || '').trim().toLowerCase();
        const password = String(payload.password || '');

        if (username === providerDemoEmail && password === providerDemoPass) {
            const profile = { email: providerDemoEmail, account_type: 'provider', provider_status: 'provider_verified' };
            return {
                access_token: makeLocalToken(profile),
                token_type: 'bearer',
                expires_in: 60 * 60 * 24,
                username: providerDemoEmail,
                mode: 'local-pages-fallback',
            };
        }

        if (username === patientDemoEmail && password === patientDemoPass) {
            const profile = { email: patientDemoEmail, account_type: 'personal', provider_status: null };
            return {
                access_token: makeLocalToken(profile),
                token_type: 'bearer',
                expires_in: 60 * 60 * 24,
                username: patientDemoEmail,
                mode: 'local-pages-fallback',
            };
        }

        const users = getLocalUsers();
        const found = users.find((u) => u.email === username && u.password === password);
        if (!found) {
            throw new Error('Credenziali non valide');
        }
        const profile = {
            email: found.email,
            account_type: found.account_type || 'personal',
            provider_status: found.account_type === 'provider' ? 'provider_verified' : null,
        };
        return {
            access_token: makeLocalToken(profile),
            token_type: 'bearer',
            expires_in: 60 * 60 * 24,
            username: found.email,
            mode: 'local-pages-fallback',
        };
    }

    if (path === '/api/me' && method === 'GET') {
        const profile = getLocalProfileFromToken();
        if (!profile) {
            throw new Error('Sessione non valida');
        }
        return {
            username: profile.email,
            account_type: profile.account_type || 'personal',
            provider_status: profile.provider_status || null,
            account_active: true,
            authenticated: true,
            timestamp: new Date().toISOString(),
            mode: 'local-pages-fallback',
        };
    }

    if (path === '/api/provider/status' && method === 'GET') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');
        const isProvider = profile.account_type === 'provider';
        return {
            username: profile.email,
            account_type: profile.account_type || 'personal',
            provider_status: isProvider ? 'provider_verified' : null,
            verified: isProvider,
            organization: isProvider
                ? {
                    id: 'demo-org-local',
                    legal_name: 'Demo Ente Locale',
                    status: 'verified',
                    domain: profile.email.split('@')[1] || 'local',
                }
                : null,
            role: isProvider ? 'admin' : null,
        };
    }

    if (path === '/api/consents' && method === 'GET') {
        return {
            count: 1,
            items: [
                {
                    consent_id: 'consent-local-demo',
                    organization_id: 'demo-org-local',
                    organization_name: 'Demo Clinica Locale',
                    organization_status: 'verified',
                    scope: { vitals: true, events: true, therapy: true },
                    version: 1,
                    granted_at: new Date().toISOString(),
                },
            ],
        };
    }

    if (path === '/api/test' && method === 'GET') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');
        const input = {
            hrv: 52,
            heart_rate: 74,
            movement: 120,
            sleep_hours: 7.3,
            medication_taken: true,
        };
        const output = computeDemoRisk(input);
        return {
            user: profile.email,
            input,
            output,
            note: 'Local demo prediction',
        };
    }

    if (path === '/api/risk-history' && method === 'GET') {
        const now = Date.now();
        const rows = [];
        for (let i = 0; i < 24; i += 1) {
            const raw = 0.45 + 0.22 * Math.sin(i / 4.2) + 0.12 * Math.cos(i / 3.1);
            rows.push({
                timestamp: new Date(now - i * 3600 * 1000).toISOString(),
                risk_score: Math.max(0.05, Math.min(0.95, raw)),
            });
        }
        return rows;
    }

    if (path === '/api/physiological-summary' && method === 'GET') {
        const labels = [];
        const hr = [];
        const hrv = [];
        for (let i = 11; i >= 0; i -= 1) {
            labels.push(new Date(Date.now() - i * 3600 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            hr.push(68 + Math.round(8 * Math.sin(i / 2.5)));
            hrv.push(48 + Math.round(7 * Math.cos(i / 3.2)));
        }
        return { hr, hrv, labels };
    }

    if (path === '/api/medication-impact' && method === 'GET') {
        return {
            with_medication: [0.29, 0.25, 0.21, 0.17, 0.14],
            without_medication: [0.58, 0.55, 0.49, 0.46, 0.42],
            labels: ['Giorno 1', 'Giorno 2', 'Giorno 3', 'Giorno 4', 'Giorno 5'],
        };
    }

    if (path === '/api/account' && method === 'DELETE') {
        return {
            status: 'deleted',
            revoked_consents: 1,
            revoked_caregiver_links: 0,
            message: 'Account locale disattivato (demo).',
        };
    }

    if (path === '/api/therapies' && method === 'GET') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');
        return readJsonStorage(userScopedKey(profile.email, 'therapies'), []);
    }

    if (path === '/api/therapies' && method === 'POST') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');
        const key = userScopedKey(profile.email, 'therapies');
        const list = readJsonStorage(key, []);
        const row = {
            id: `th-${Date.now()}`,
            medication_name: String(payload.medication_name || '').trim(),
            dosage: payload.dosage || null,
            intake_time: payload.intake_time || null,
        };
        if (!row.medication_name) throw new Error('Nome farmaco obbligatorio');
        list.push(row);
        writeJsonStorage(key, list);
        return row;
    }

    if (path.startsWith('/api/therapies/') && method === 'DELETE') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');
        const therapyId = path.split('/').pop();
        const key = userScopedKey(profile.email, 'therapies');
        const list = readJsonStorage(key, []);
        writeJsonStorage(key, list.filter((t) => t.id !== therapyId));
        return { status: 'success', message: 'Terapia eliminata' };
    }

    if (path === '/api/wearable/providers' && method === 'GET') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');
        const connected = readJsonStorage(userScopedKey(profile.email, 'wearables'), []);
        const catalog = [
            ['fitbit', 'Fitbit', 'watch+fitness', 'oauth'],
            ['garmin_connect', 'Garmin Connect', 'watch+fitness', 'oauth'],
            ['samsung_health', 'Samsung Health', 'watch+phone', 'bridge'],
            ['health_connect', 'Android Health Connect', 'phone-hub', 'bridge'],
            ['apple_health', 'Apple Health', 'phone-hub', 'bridge'],
            ['oura', 'Oura', 'ring+sleep', 'oauth'],
            ['polar_flow', 'Polar Flow', 'watch+fitness', 'oauth'],
            ['withings', 'Withings', 'wearable+health', 'oauth'],
            ['strava', 'Strava', 'activity', 'oauth'],
            ['google_fit', 'Google Fit (legacy)', 'fitness', 'legacy'],
        ];
        const items = catalog.map(([provider_key, provider_name, category, supported_mode]) => ({
            provider_key,
            provider_name,
            category,
            supported_mode,
            connected: connected.includes(provider_key),
            status: connected.includes(provider_key) ? 'connected' : 'not_connected',
            connected_at: connected.includes(provider_key) ? new Date().toISOString() : null,
            last_sync_at: null,
            message: connected.includes(provider_key) ? 'Collegato (demo)' : 'Non collegato',
        }));
        return {
            total: items.length,
            connected: items.filter((i) => i.connected).length,
            items,
        };
    }

    if (path.startsWith('/api/wearable/connect/') && method === 'POST') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');
        const providerKey = path.split('/').pop();
        const key = userScopedKey(profile.email, 'wearables');
        const connected = readJsonStorage(key, []);
        if (!connected.includes(providerKey)) {
            connected.push(providerKey);
            writeJsonStorage(key, connected);
        }
        return {
            provider_key: providerKey,
            mode: payload.mode || 'demo',
            status: 'connected',
            message: 'Provider collegato in demo locale.',
        };
    }

    if (path.startsWith('/api/wearable/connect/') && method === 'DELETE') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');
        const providerKey = path.split('/').pop();
        const key = userScopedKey(profile.email, 'wearables');
        const connected = readJsonStorage(key, []);
        writeJsonStorage(key, connected.filter((p) => p !== providerKey));
        return {
            provider_key: providerKey,
            status: 'disconnected',
            message: 'Provider disconnesso.',
        };
    }

    if (path === '/api/predict' && method === 'POST') {
        const result = computeDemoRisk(payload);
        return {
            ...result,
            timestamp: new Date().toISOString(),
        };
    }

    return null;
}

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
    if (isStaticPagesApiBase()) {
        const localResult = await localApiFallback(path, options);
        if (localResult) {
            return localResult;
        }
    }

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
        const nonJsonHint = !contentType.includes('application/json')
            ? ' Endpoint backend non raggiungibile o api_base non corretto.'
            : '';
        throw new Error((payload.message || payload.detail || `Errore ${response.status}`) + nonJsonHint);
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
        summaryEl.textContent = isStaticPagesApiBase()
            ? `Modalita demo locale: ${providers.connected} su ${providers.total} provider simulati. Per connessione reale imposta un backend API.`
            : `${providers.connected} su ${providers.total} provider collegati.`;

        container.innerHTML = providers.items.map((item) => {
            const connectAction = item.connected
                ? `<button class="btn btn-outline" data-provider-disconnect="${item.provider_key}">Disconnetti</button>`
                : `<button class="btn" data-provider-connect="${item.provider_key}" data-provider-mode="${item.supported_mode === 'oauth' ? 'oauth' : 'demo'}">${isStaticPagesApiBase() ? 'Simula collegamento' : 'Collega'}</button>`;

            const oauthHelp = item.supported_mode === 'oauth'
                ? '<p class="muted">Modalita`: OAuth diretto (attiva con credenziali provider).</p>'
                : '<p class="muted">Modalita`: bridge/app companion.</p>';

            const runtimeHelp = isStaticPagesApiBase()
                ? '<p class="muted">Stai usando Pages statico: collegamento reale non possibile senza backend API.</p>'
                : '';

            return `
                <article class="card">
                    <h3>${item.provider_name}</h3>
                    <p class="muted">Categoria: ${item.category} · Integrazione: ${providerModeLabel(item.supported_mode)}</p>
                    <p>${providerStatusTag(item)}</p>
                    ${oauthHelp}
                    ${runtimeHelp}
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

function riskLabel(score) {
    if (score >= 0.67) return 'HIGH';
    if (score >= 0.34) return 'MEDIUM';
    return 'LOW';
}

function renderRiskChart(items) {
    const canvas = document.getElementById('riskMainChart');
    if (!canvas || typeof Chart === 'undefined' || !items?.length) return;

    const labels = items.slice(0, 12).reverse().map((item) =>
        new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    const values = items.slice(0, 12).reverse().map((item) => Number(item.risk_score || 0));

    if (riskChart) {
        riskChart.destroy();
    }

    riskChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Rischio',
                    data: values,
                    borderColor: '#00f2ff',
                    backgroundColor: 'rgba(0,242,255,0.2)',
                    fill: true,
                    tension: 0.3,
                },
            ],
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    min: 0,
                    max: 1,
                },
            },
            plugins: {
                legend: {
                    labels: { color: '#cfd3da' },
                },
            },
        },
    });
}

function renderRiskHistory(items) {
    const list = document.getElementById('riskHistoryList');
    if (!list) return;
    if (!items || !items.length) {
        list.innerHTML = '<p class="muted">Storico non disponibile.</p>';
        return;
    }

    list.innerHTML = items.slice(0, 12).map((item) => {
        const pct = Math.round(item.risk_score * 100);
        const level = riskLabel(item.risk_score).toLowerCase();
        return `
            <div class="card" style="padding: 0.6rem; margin-bottom: 0.5rem;">
                <div style="display:flex; justify-content:space-between; gap:0.6rem;">
                    <span class="muted">${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <strong class="risk-${level}">${pct}%</strong>
                </div>
                <div style="height:8px; background:rgba(255,255,255,0.08); margin-top:0.35rem;">
                    <div style="height:8px; width:${pct}%; background:linear-gradient(90deg,#00ff88,#ffcc00,#ff3131);"></div>
                </div>
            </div>
        `;
    }).join('');
}

function readDashboardList(username, key) {
    return readJsonStorage(userScopedKey(username, key), []);
}

function writeDashboardList(username, key, value) {
    writeJsonStorage(userScopedKey(username, key), value);
}

function renderEventTimeline(events, onDelete) {
    const timeline = document.getElementById('eventTimeline');
    if (!timeline) return;
    if (!events.length) {
        timeline.innerHTML = '<p class="muted">Nessun evento registrato.</p>';
        return;
    }
    timeline.innerHTML = events.map((ev) => `
        <div class="card" style="padding:0.6rem; margin-bottom:0.5rem;">
          <div style="display:flex; justify-content:space-between; gap:0.6rem; align-items:center;">
            <div>
              <strong>${ev.type.toUpperCase()}</strong>
              <p class="muted">Intensita: ${ev.intensity} · ${new Date(ev.when).toLocaleString()}</p>
              <p class="muted">${ev.notes || 'Nessuna nota'}</p>
            </div>
            <button class="btn btn-outline" data-event-delete="${ev.id}">Elimina</button>
          </div>
        </div>
    `).join('');
    timeline.querySelectorAll('[data-event-delete]').forEach((btn) => {
        btn.addEventListener('click', () => onDelete(btn.getAttribute('data-event-delete')));
    });
}

function minutesUntilNext(timeValue) {
    const [hh, mm] = timeValue.split(':').map((v) => Number(v));
    const now = new Date();
    const target = new Date();
    target.setHours(hh, mm, 0, 0);
    if (target <= now) {
        target.setDate(target.getDate() + 1);
    }
    return Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
}

function scheduleReminder(username, reminder) {
    const key = `${username}:${reminder.id}`;
    if (reminderTimers[key]) {
        clearTimeout(reminderTimers[key]);
    }
    const delay = minutesUntilNext(reminder.time) * 60 * 1000;
    reminderTimers[key] = setTimeout(() => {
        const message = `Promemoria terapia: ${reminder.medication} alle ${reminder.time}`;
        if (Notification.permission === 'granted') {
            new Notification('Epiguard Reminder', { body: message });
        } else {
            alert(message);
        }
        scheduleReminder(username, reminder);
    }, delay);
}

function renderReminderList(username, reminders, onDelete) {
    const list = document.getElementById('reminderList');
    if (!list) return;
    if (!reminders.length) {
        list.innerHTML = '<p class="muted">Nessun reminder attivo.</p>';
        return;
    }
    list.innerHTML = reminders.map((r) => `
        <div class="card" style="padding:0.6rem; margin-bottom:0.5rem;">
          <div style="display:flex; justify-content:space-between; gap:0.6rem; align-items:center;">
            <div>
              <strong>${r.medication}</strong>
              <p class="muted">Ogni giorno alle ${r.time}</p>
            </div>
            <button class="btn btn-outline" data-reminder-delete="${r.id}">Disattiva</button>
          </div>
        </div>
    `).join('');
    list.querySelectorAll('[data-reminder-delete]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-reminder-delete');
            const timerKey = `${username}:${id}`;
            if (reminderTimers[timerKey]) {
                clearTimeout(reminderTimers[timerKey]);
                delete reminderTimers[timerKey];
            }
            onDelete(id);
        });
    });
}

function openPrintableReport({ username, riskScore, riskMessage, therapies, events }) {
    const win = window.open('', '_blank', 'noopener');
    if (!win) {
        alert('Popup bloccato: abilita popup per esportare il report PDF.');
        return;
    }
    const html = `
      <html>
      <head><title>Report Epiguard</title></head>
      <body style="font-family:Arial,sans-serif;padding:24px;">
        <h1>Report Paziente</h1>
        <p><strong>Utente:</strong> ${username}</p>
        <p><strong>Rischio attuale:</strong> ${(riskScore * 100).toFixed(1)}% (${riskLabel(riskScore)})</p>
        <p><strong>Messaggio AI:</strong> ${riskMessage}</p>
        <h2>Terapia</h2>
        <ul>${therapies.map((t) => `<li>${t.medication_name} ${t.dosage || ''} ${t.intake_time || ''}</li>`).join('')}</ul>
        <h2>Eventi clinici</h2>
        <ul>${events.map((e) => `<li>${new Date(e.when).toLocaleString()} - ${e.type} (intensita ${e.intensity}) ${e.notes || ''}</li>`).join('')}</ul>
        <p style="margin-top:24px;font-size:12px;color:#666;">Documento generato dalla web app Epiguard.</p>
      </body>
      </html>
    `;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
}

function getAlertRules(username) {
    return readDashboardList(username, 'alert_rules')[0] || {
        risk_threshold: 67,
        hr_threshold: 120,
        hrv_threshold: 35,
    };
}

function saveAlertRules(username, rules) {
    writeDashboardList(username, 'alert_rules', [rules]);
}

function pushAlertEvent(username, message) {
    const history = readDashboardList(username, 'alerts');
    history.unshift({
        id: `al-${Date.now()}`,
        message,
        when: new Date().toISOString(),
    });
    writeDashboardList(username, 'alerts', history.slice(0, 20));
}

function notifyAlert(message) {
    if (!('Notification' in window)) {
        alert(message);
        return;
    }
    if (Notification.permission === 'granted') {
        new Notification('Epiguard Alert', { body: message });
        return;
    }
    if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                new Notification('Epiguard Alert', { body: message });
            } else {
                alert(message);
            }
        });
        return;
    }
    alert(message);
}

function evaluateAlertRules({ username, rules, riskScore, hrCurrent, hrvCurrent }) {
    const triggers = [];
    if (typeof riskScore === 'number' && riskScore * 100 >= rules.risk_threshold) {
        triggers.push(`Rischio oltre soglia (${(riskScore * 100).toFixed(1)}% >= ${rules.risk_threshold}%)`);
    }
    if (typeof hrCurrent === 'number' && hrCurrent >= rules.hr_threshold) {
        triggers.push(`Battito alto (${hrCurrent} bpm >= ${rules.hr_threshold})`);
    }
    if (typeof hrvCurrent === 'number' && hrvCurrent <= rules.hrv_threshold) {
        triggers.push(`HRV basso (${hrvCurrent} ms <= ${rules.hrv_threshold})`);
    }

    const statusEl = document.getElementById('alertStatusText');
    if (!triggers.length) {
        if (statusEl) {
            statusEl.textContent = 'Nessun alert attivo con le soglie correnti.';
        }
        return;
    }

    const message = `Alert: ${triggers.join(' | ')}`;
    pushAlertEvent(username, message);
    if (statusEl) {
        statusEl.textContent = `${message} (${new Date().toLocaleTimeString()})`;
    }
    notifyAlert(message);
}

function buildAiTips({ riskText, riskScore, therapies }) {
    const tips = [];
    if (riskScore >= 0.67) {
        tips.push('Rischio alto: riduci stimoli, resta in ambiente sicuro e avvisa un caregiver.');
    } else if (riskScore >= 0.34) {
        tips.push('Rischio medio: privilegia riposo e idratazione nelle prossime ore.');
    } else {
        tips.push('Rischio basso: mantieni routine stabile e monitoraggio leggero.');
    }

    if (!therapies.length) {
        tips.push('Aggiungi la terapia nella dashboard: migliora il monitoraggio e i promemoria.');
    } else {
        tips.push(`Terapia attiva: ${therapies.length} farmaco/i registrati. Mantieni orari regolari.`);
    }

    if (riskText?.toLowerCase().includes('sonno') || riskScore >= 0.34) {
        tips.push('Priorita sonno: punta a 7-8 ore continuative stasera.');
    }

    tips.push('Condividi i trend con il medico tramite area consensi quando necessario.');
    return tips.slice(0, 4);
}

function renderAiTips(tips) {
    const aiTips = document.getElementById('aiTips');
    if (!aiTips) return;
    aiTips.innerHTML = tips.map((tip) => `<li class="muted">${tip}</li>`).join('');
}

function renderDeepAiAnalysis({
    riskScore,
    riskMessage,
    hrCurrent,
    hrvCurrent,
    medWith,
    medWithout,
}) {
    const box = document.getElementById('aiDeepAnalysis');
    if (!box) return;

    const riskText = riskLabel(riskScore);
    let trendText = 'stabile';
    if (riskScore >= 0.67) trendText = 'in peggioramento';
    if (riskScore <= 0.25) trendText = 'in miglioramento';

    let medImpactText = 'non disponibile';
    if (typeof medWith === 'number' && typeof medWithout === 'number') {
        const delta = Math.max(0, (medWithout - medWith) * 100);
        medImpactText = `riduzione rischio stimata ~${delta.toFixed(1)}% con terapia`;
    }

    const lines = [
        `Stato attuale: rischio ${riskText} (${(riskScore * 100).toFixed(1)}%), trend ${trendText}.`,
        `Segnali fisiologici: HR ${hrCurrent ?? 'N/D'} bpm, HRV ${hrvCurrent ?? 'N/D'} ms.`,
        `Impatto terapia: ${medImpactText}.`,
        `Sintesi AI: ${riskMessage || 'monitoraggio continuo consigliato.'}`,
    ];

    box.innerHTML = `
        <h3 style="margin-bottom:0.5rem;">Analisi completa AI</h3>
        <ul style="margin-left:1rem; display:block;">
            ${lines.map((line) => `<li class="muted" style="margin-bottom:0.4rem;">${line}</li>`).join('')}
        </ul>
    `;
}

function renderTherapyList(therapies, onDelete) {
    const box = document.getElementById('therapyList');
    if (!box) return;
    if (!therapies.length) {
        box.innerHTML = '<p class="muted">Nessun farmaco registrato.</p>';
        return;
    }
    box.innerHTML = therapies.map((t) => `
        <div class="card" style="padding:0.6rem; margin-bottom:0.5rem;">
          <div style="display:flex; justify-content:space-between; gap:0.6rem; align-items:center;">
            <div>
              <strong>${t.medication_name}</strong>
              <p class="muted">${t.dosage || 'Dosaggio non inserito'} ${t.intake_time ? `· ${t.intake_time}` : ''}</p>
            </div>
            <button class="btn btn-outline" data-therapy-delete="${t.id}">Elimina</button>
          </div>
        </div>
    `).join('');
    box.querySelectorAll('[data-therapy-delete]').forEach((btn) => {
        btn.addEventListener('click', () => onDelete(btn.getAttribute('data-therapy-delete')));
    });
}

function updateReminderMedicationOptions(therapies) {
    const options = document.getElementById('reminderMedicationOptions');
    if (!options) return;
    const uniqueNames = [...new Set(therapies.map((t) => t.medication_name).filter(Boolean))];
    options.innerHTML = uniqueNames.map((name) => `<option value="${name}"></option>`).join('');
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
                watchStatus.textContent = 'Apertura selettore Bluetooth (tutti i dispositivi)...';
                const device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['heart_rate', 'battery_service'],
                });
                watchStatus.textContent = `Dispositivo selezionato: ${device.name || 'BLE sconosciuto'}. Alcuni smartwatch richiedono app companion per dati completi.`;
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
        const apiBaseInput = document.getElementById('apiBaseInput');
        if (apiBaseInfo) {
            apiBaseInfo.textContent = API_BASE;
        }
        if (apiBaseInput) {
            apiBaseInput.value = localStorage.getItem(API_BASE_STORAGE_KEY) || '';
        }

        const apiBaseForm = document.getElementById('apiBaseForm');
        if (apiBaseForm) {
            apiBaseForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const raw = (apiBaseInput?.value || '').trim();
                if (!raw) {
                    localStorage.removeItem(API_BASE_STORAGE_KEY);
                    window.location.reload();
                    return;
                }

                if (!/^https?:\/\//i.test(raw)) {
                    showError(error, 'Inserisci un URL valido che inizi con http:// o https://');
                    return;
                }

                localStorage.setItem(API_BASE_STORAGE_KEY, raw.replace(/\/$/, ''));
                window.location.reload();
            });
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

        let lastRiskScore = 0;
        let lastRiskMessage = '';
        let hrCurrent = null;
        let hrvCurrent = null;
        let medWith = null;
        let medWithout = null;
        const dashboardUser = user.username || 'user';
        const alertRules = getAlertRules(dashboardUser);

        let therapiesState = [];
        let eventsState = readDashboardList(dashboardUser, 'events');
        let remindersState = readDashboardList(dashboardUser, 'reminders');

        try {
            const prediction = await api('/api/test');
            document.getElementById('lastRisk').textContent = prediction.output.risk_level.toUpperCase();
            document.getElementById('lastMessage').textContent = prediction.output.message;
            lastRiskScore = Number(prediction.output.risk_score || 0);
            lastRiskMessage = prediction.output.message || '';
        } catch {
            document.getElementById('lastRisk').textContent = 'N/D';
        }

        try {
            const history = await api('/api/risk-history');
            renderRiskChart(history);
            renderRiskHistory(history);
            if (history.length) {
                lastRiskScore = Number(history[0].risk_score || lastRiskScore);
            }
        } catch {
            renderRiskHistory([]);
        }

        try {
            const physio = await api('/api/physiological-summary');
            if (Array.isArray(physio.hr) && physio.hr.length) {
                hrCurrent = physio.hr[physio.hr.length - 1];
            }
            if (Array.isArray(physio.hrv) && physio.hrv.length) {
                hrvCurrent = physio.hrv[physio.hrv.length - 1];
            }
        } catch {
            hrCurrent = null;
            hrvCurrent = null;
        }

        try {
            const med = await api('/api/medication-impact');
            if (Array.isArray(med.with_medication) && med.with_medication.length) {
                medWith = med.with_medication[med.with_medication.length - 1];
            }
            if (Array.isArray(med.without_medication) && med.without_medication.length) {
                medWithout = med.without_medication[med.without_medication.length - 1];
            }
        } catch {
            medWith = null;
            medWithout = null;
        }

        const refreshTherapies = async () => {
            try {
                const therapies = await api('/api/therapies');
                therapiesState = therapies;
                updateReminderMedicationOptions(therapiesState);
                renderTherapyList(therapies, async (therapyId) => {
                    await api(`/api/therapies/${therapyId}`, { method: 'DELETE' });
                    await refreshTherapies();
                });
                renderAiTips(buildAiTips({ riskText: lastRiskMessage, riskScore: lastRiskScore, therapies: therapiesState }));
            } catch {
                renderTherapyList([], () => {});
            }
        };

        const quickForm = document.getElementById('quickTherapyForm');
        if (quickForm) {
            quickForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const medication_name = document.getElementById('quickMedicationName').value.trim();
                const dosage = document.getElementById('quickMedicationDose').value.trim();
                const intake_time = document.getElementById('quickMedicationTime').value;
                if (!medication_name) return;

                await api('/api/therapies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ medication_name, dosage: dosage || null, intake_time: intake_time || null }),
                });
                quickForm.reset();
                await refreshTherapies();
            });
        }

        const bulkBtn = document.getElementById('quickMedicationBulkBtn');
        if (bulkBtn) {
            bulkBtn.addEventListener('click', async () => {
                const bulkInput = document.getElementById('quickMedicationBulk');
                const rows = (bulkInput?.value || '')
                    .split('\n')
                    .map((r) => r.trim())
                    .filter(Boolean);

                for (const row of rows) {
                    const [nameRaw, doseRaw, timeRaw] = row.split('|');
                    const medication_name = (nameRaw || '').trim();
                    if (!medication_name) continue;
                    await api('/api/therapies', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            medication_name,
                            dosage: (doseRaw || '').trim() || null,
                            intake_time: (timeRaw || '').trim() || null,
                        }),
                    });
                }
                if (bulkInput) bulkInput.value = '';
                await refreshTherapies();
            });
        }

        const refreshEvents = () => {
            eventsState = readDashboardList(dashboardUser, 'events')
                .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
            renderEventTimeline(eventsState, (eventId) => {
                const filtered = eventsState.filter((ev) => ev.id !== eventId);
                writeDashboardList(dashboardUser, 'events', filtered);
                refreshEvents();
            });
            renderAiTips(buildAiTips({ riskText: lastRiskMessage, riskScore: lastRiskScore, therapies: therapiesState }));
        };

        const clinicalForm = document.getElementById('clinicalEventForm');
        if (clinicalForm) {
            clinicalForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const next = {
                    id: `ev-${Date.now()}`,
                    type: document.getElementById('eventType').value,
                    intensity: Number(document.getElementById('eventIntensity').value || 1),
                    when: document.getElementById('eventWhen').value || new Date().toISOString(),
                    notes: document.getElementById('eventNotes').value.trim(),
                };
                const list = readDashboardList(dashboardUser, 'events');
                list.push(next);
                writeDashboardList(dashboardUser, 'events', list);
                clinicalForm.reset();
                refreshEvents();
            });
        }

        const refreshReminders = () => {
            remindersState = readDashboardList(dashboardUser, 'reminders');
            renderReminderList(dashboardUser, remindersState, (id) => {
                const filtered = remindersState.filter((r) => r.id !== id);
                writeDashboardList(dashboardUser, 'reminders', filtered);
                refreshReminders();
            });
            remindersState.forEach((r) => scheduleReminder(dashboardUser, r));
        };

        const alertForm = document.getElementById('alertRulesForm');
        if (alertForm) {
            const riskInput = document.getElementById('alertRiskThreshold');
            const hrInput = document.getElementById('alertHrThreshold');
            const hrvInput = document.getElementById('alertHrvThreshold');
            if (riskInput) riskInput.value = alertRules.risk_threshold;
            if (hrInput) hrInput.value = alertRules.hr_threshold;
            if (hrvInput) hrvInput.value = alertRules.hrv_threshold;

            alertForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const nextRules = {
                    risk_threshold: Number(riskInput?.value || 67),
                    hr_threshold: Number(hrInput?.value || 120),
                    hrv_threshold: Number(hrvInput?.value || 35),
                };
                saveAlertRules(dashboardUser, nextRules);
                const statusEl = document.getElementById('alertStatusText');
                if (statusEl) {
                    statusEl.textContent = 'Regole alert salvate.';
                }
            });
        }

        const testAlertBtn = document.getElementById('testAlertNowBtn');
        if (testAlertBtn) {
            testAlertBtn.addEventListener('click', () => {
                notifyAlert('Test alert riuscito: notifiche e workflow attivi.');
            });
        }

        const reminderForm = document.getElementById('therapyReminderForm');
        if (reminderForm) {
            reminderForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const medication = document.getElementById('reminderMedication').value.trim();
                const time = document.getElementById('reminderTime').value;
                if (!medication || !time) return;
                const list = readDashboardList(dashboardUser, 'reminders');
                list.push({ id: `rem-${Date.now()}`, medication, time });
                writeDashboardList(dashboardUser, 'reminders', list);
                reminderForm.reset();
                refreshReminders();
            });
        }

        const permBtn = document.getElementById('notificationPermissionBtn');
        if (permBtn) {
            permBtn.addEventListener('click', async () => {
                if (!('Notification' in window)) {
                    alert('Notifiche browser non supportate su questo dispositivo.');
                    return;
                }
                const perm = await Notification.requestPermission();
                alert(`Stato notifiche: ${perm}`);
            });
        }

        const exportBtn = document.getElementById('exportPdfBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                openPrintableReport({
                    username: dashboardUser,
                    riskScore: lastRiskScore,
                    riskMessage: lastRiskMessage,
                    therapies: therapiesState,
                    events: eventsState,
                });
            });
        }

        await refreshTherapies();
        refreshEvents();
        refreshReminders();
        renderDeepAiAnalysis({
            riskScore: lastRiskScore,
            riskMessage: lastRiskMessage,
            hrCurrent,
            hrvCurrent,
            medWith,
            medWithout,
        });
        evaluateAlertRules({
            username: dashboardUser,
            rules: getAlertRules(dashboardUser),
            riskScore: lastRiskScore,
            hrCurrent,
            hrvCurrent,
        });
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

    if (page === 'therapy') {
        const user = await requireAuth(['personal']);
        if (!user) return;

        const listBox = document.getElementById('medications');
        const form = document.getElementById('add-medication-form');

        const renderTherapiesOnPage = (therapies) => {
            if (!listBox) return;
            if (!therapies.length) {
                listBox.innerHTML = '<p class="muted">Nessun farmaco inserito.</p>';
                return;
            }
            listBox.innerHTML = therapies.map((therapy) => `
                <div class="card" style="padding:0.7rem; margin-bottom:0.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem;">
                        <div>
                            <strong>${therapy.medication_name}</strong>
                            <p class="muted">${therapy.dosage || 'Dosaggio non inserito'} ${therapy.intake_time ? `· ${therapy.intake_time}` : ''}</p>
                        </div>
                        <button class="btn btn-outline" data-therapy-delete="${therapy.id}">Elimina</button>
                    </div>
                </div>
            `).join('');

            listBox.querySelectorAll('[data-therapy-delete]').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const therapyId = btn.getAttribute('data-therapy-delete');
                    await api(`/api/therapies/${therapyId}`, { method: 'DELETE' });
                    await loadTherapiesPage();
                });
            });
        };

        const loadTherapiesPage = async () => {
            try {
                const therapies = await api('/api/therapies');
                renderTherapiesOnPage(therapies);
            } catch (err) {
                if (listBox) listBox.innerHTML = `<p class="muted">Errore caricamento terapie: ${err.message}</p>`;
            }
        };

        if (form) {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const medication_name = document.getElementById('medication-name').value.trim();
                const dosage = document.getElementById('medication-dosage').value.trim();
                const intake_time = document.getElementById('medication-time').value;
                if (!medication_name) return;

                await api('/api/therapies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        medication_name,
                        dosage: dosage || null,
                        intake_time: intake_time || null,
                    }),
                });
                form.reset();
                await loadTherapiesPage();
            });
        }

        await loadTherapiesPage();
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
