const TOKEN_KEY = 'authToken';
const API_BASE_STORAGE_KEY = 'epiguard_api_base';
const LOCAL_USERS_KEY = 'epiguard_local_users';
const LOCAL_RECOVERY_TOKENS_KEY = 'epiguard_local_recovery_tokens';
const LOCAL_FALLBACK_STORAGE_KEY = 'epiguard_local_fallback';
const LOCAL_PASSKEYS_KEY = 'epiguard_local_passkeys';
const GIULIA_EMAIL = 'giulia.casaldi@gmail.com';
const GIULIA_PASSWORD = 'GiuliaEpi2026!';

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
let riskV2Chart = null;
let physiologicalV2Chart = null;
let medicationV2Chart = null;
const reminderTimers = {};

function isStaticPagesApiBase() {
    return API_BASE.includes('github.io');
}

function isLocalFallbackEnabled() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('local_demo') === '0') {
        localStorage.removeItem(LOCAL_FALLBACK_STORAGE_KEY);
        return false;
    }
    if (params.get('local_demo') === '1') {
        localStorage.setItem(LOCAL_FALLBACK_STORAGE_KEY, '1');
    }

    if (isStaticPagesApiBase() && !localStorage.getItem(LOCAL_FALLBACK_STORAGE_KEY)) {
        localStorage.setItem(LOCAL_FALLBACK_STORAGE_KEY, '1');
    }

    return localStorage.getItem(LOCAL_FALLBACK_STORAGE_KEY) === '1';
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

function getLocalRecoveryTokens() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_RECOVERY_TOKENS_KEY) || '[]');
    } catch {
        return [];
    }
}

function setLocalRecoveryTokens(tokens) {
    localStorage.setItem(LOCAL_RECOVERY_TOKENS_KEY, JSON.stringify(tokens));
}

function getLocalPasskeyState() {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_PASSKEYS_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object') {
            return { credentials_by_email: {}, challenges: {} };
        }
        return {
            credentials_by_email: parsed.credentials_by_email || {},
            challenges: parsed.challenges || {},
        };
    } catch {
        return { credentials_by_email: {}, challenges: {} };
    }
}

function setLocalPasskeyState(state) {
    localStorage.setItem(LOCAL_PASSKEYS_KEY, JSON.stringify(state));
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

function userBiometricSamplesKey(email) {
    return userScopedKey(email, 'biometric_samples');
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

        if (username === GIULIA_EMAIL && password === GIULIA_PASSWORD) {
            const profile = { email: GIULIA_EMAIL, account_type: 'personal', provider_status: null };
            return {
                access_token: makeLocalToken(profile),
                token_type: 'bearer',
                expires_in: 60 * 60 * 24,
                username: GIULIA_EMAIL,
                mode: 'local-pages-fallback',
            };
        }

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

    if (path === '/auth/passkey/register/options' && method === 'POST') {
        const email = String(payload.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            throw new Error('Email non valida');
        }

        const users = getLocalUsers();
        if (!users.some((u) => u.email === email) && ![providerDemoEmail, patientDemoEmail, GIULIA_EMAIL].includes(email)) {
            users.push({ email, password: '', account_type: 'personal', created_at: new Date().toISOString() });
            setLocalUsers(users);
        }

        const state = getLocalPasskeyState();
        const entries = state.credentials_by_email[email] || [];
        const challenge = randomBase64url(32);
        state.challenges[`${email}::register`] = {
            challenge,
            expires_at: Date.now() + (5 * 60 * 1000),
        };
        setLocalPasskeyState(state);

        return {
            options: {
                challenge,
                rp: { name: 'Epiguard', id: window.location.hostname },
                user: {
                    id: utf8Base64url(email),
                    name: email,
                    displayName: email,
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },
                    { type: 'public-key', alg: -257 },
                ],
                timeout: 60000,
                excludeCredentials: entries.map((id) => ({ id, type: 'public-key' })),
                authenticatorSelection: {
                    residentKey: 'preferred',
                    userVerification: 'preferred',
                },
                attestation: 'none',
            },
            expires_in_seconds: 300,
            mode: 'local-pages-fallback',
        };
    }

    if (path === '/auth/passkey/register/complete' && method === 'POST') {
        const email = String(payload.email || '').trim().toLowerCase();
        const credential = payload.credential || {};
        const state = getLocalPasskeyState();
        const challenge = state.challenges[`${email}::register`];
        if (!challenge || Number(challenge.expires_at || 0) < Date.now()) {
            throw new Error('Challenge passkey scaduta o non valida');
        }
        if (!credential.id) {
            throw new Error('Credential ID passkey mancante');
        }

        const entries = state.credentials_by_email[email] || [];
        if (!entries.includes(credential.id)) {
            entries.push(credential.id);
        }
        state.credentials_by_email[email] = entries;
        delete state.challenges[`${email}::register`];
        setLocalPasskeyState(state);

        return {
            status: 'success',
            message: 'Passkey biometrica registrata con successo (modalita locale).',
            mode: 'local-pages-fallback',
        };
    }

    if (path === '/auth/passkey/login/options' && method === 'POST') {
        const email = String(payload.email || '').trim().toLowerCase();
        const state = getLocalPasskeyState();
        const entries = state.credentials_by_email[email] || [];
        if (!entries.length) {
            throw new Error('Nessuna passkey registrata per questo account');
        }

        const challenge = randomBase64url(32);
        state.challenges[`${email}::login`] = {
            challenge,
            expires_at: Date.now() + (5 * 60 * 1000),
        };
        setLocalPasskeyState(state);

        return {
            options: {
                challenge,
                rpId: window.location.hostname,
                timeout: 60000,
                userVerification: 'preferred',
                allowCredentials: entries.map((id) => ({ id, type: 'public-key' })),
            },
            expires_in_seconds: 300,
            mode: 'local-pages-fallback',
        };
    }

    if (path === '/auth/passkey/login/complete' && method === 'POST') {
        const email = String(payload.email || '').trim().toLowerCase();
        const credential = payload.credential || {};
        const state = getLocalPasskeyState();
        const challenge = state.challenges[`${email}::login`];
        if (!challenge || Number(challenge.expires_at || 0) < Date.now()) {
            throw new Error('Challenge passkey scaduta o non valida');
        }

        const entries = state.credentials_by_email[email] || [];
        if (!credential.id || !entries.includes(credential.id)) {
            throw new Error('Passkey non riconosciuta');
        }

        delete state.challenges[`${email}::login`];
        setLocalPasskeyState(state);

        const accountType = email === providerDemoEmail ? 'provider' : 'personal';
        const profile = {
            email,
            account_type: accountType,
            provider_status: accountType === 'provider' ? 'provider_verified' : null,
        };
        return {
            access_token: makeLocalToken(profile),
            token_type: 'bearer',
            expires_in: 60 * 60 * 24,
            username: email,
            mode: 'local-pages-fallback',
        };
    }

    if (path === '/auth/password-recovery/request' && method === 'POST') {
        const email = String(payload.email || '').trim().toLowerCase();
        const users = getLocalUsers();
        const exists = users.some((u) => u.email === email)
            || email === providerDemoEmail
            || email === patientDemoEmail;

        if (!exists) {
            return {
                status: 'accepted',
                message: "Se l'account esiste, riceverai un codice recovery valido 15 minuti.",
            };
        }

        const token = `rcv-${Math.random().toString(36).slice(2, 12)}-${Date.now().toString(36)}`;
        const expiresInSeconds = 15 * 60;
        const tokens = getLocalRecoveryTokens().filter((t) => t.email !== email || t.used_at);
        tokens.push({
            email,
            token,
            created_at: Date.now(),
            expires_at: Date.now() + expiresInSeconds * 1000,
            used_at: null,
        });
        setLocalRecoveryTokens(tokens);

        return {
            status: 'accepted',
            message: 'Recovery avviato: usa il token per impostare una nuova password.',
            recovery_token: token,
            expires_in_seconds: expiresInSeconds,
        };
    }

    if (path === '/auth/password-recovery/confirm' && method === 'POST') {
        const email = String(payload.email || '').trim().toLowerCase();
        const recoveryToken = String(payload.recovery_token || '').trim();
        const newPassword = String(payload.new_password || '');

        if (newPassword.length < 8) {
            throw new Error('Password troppo corta (min 8 caratteri)');
        }

        const tokens = getLocalRecoveryTokens();
        const tokenRow = tokens.find((t) => (
            t.email === email
            && t.token === recoveryToken
            && !t.used_at
            && Number(t.expires_at) > Date.now()
        ));
        if (!tokenRow) {
            throw new Error('Token recovery non valido o scaduto');
        }

        const users = getLocalUsers();
        const index = users.findIndex((u) => u.email === email);
        if (index >= 0) {
            users[index].password = newPassword;
            setLocalUsers(users);
        }

        tokenRow.used_at = Date.now();
        setLocalRecoveryTokens(tokens);

        return {
            status: 'success',
            message: 'Password aggiornata con successo. Effettua il login con la nuova password.',
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
        const profile = getLocalProfileFromToken();
        const samples = profile ? readJsonStorage(userBiometricSamplesKey(profile.email), []) : [];
        if (samples.length) {
            return samples.slice(-24).reverse().map((s) => {
                const risk = computeDemoRisk({
                    hrv: s.hrv,
                    heart_rate: s.heart_rate,
                    movement: s.movement,
                    sleep_hours: s.sleep_hours,
                    medication_taken: true,
                });
                return {
                    timestamp: s.timestamp,
                    risk_score: risk.risk_score,
                };
            });
        }

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
        const profile = getLocalProfileFromToken();
        const samples = profile ? readJsonStorage(userBiometricSamplesKey(profile.email), []) : [];
        if (samples.length) {
            const latest = samples.slice(-12);
            return {
                hr: latest.map((s) => s.heart_rate),
                hrv: latest.map((s) => s.hrv),
                labels: latest.map((s) => new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
            };
        }

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
        const syncMeta = readJsonStorage(userScopedKey(profile.email, 'wearables_sync_meta'), null);
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
            last_sync_at: connected.includes(provider_key) ? (syncMeta?.last_sync_at || null) : null,
        }));
        return {
            total: items.length,
            connected: items.filter((i) => i.connected).length,
            items,
        };
    }

    if (path === '/api/wearable/sync' && method === 'POST') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');

        const connected = readJsonStorage(userScopedKey(profile.email, 'wearables'), []);
        if (!connected.length) {
            throw new Error('Nessun provider wearable collegato');
        }

        const now = new Date();
        const count = connected.length;
        const hr = Math.max(52, Math.min(145, Math.round(73 + 6 * Math.sin(Date.now() / 210000) - count)));
        const hrv = Math.max(20, Math.min(95, Math.round(45 + 5 * Math.cos(Date.now() / 180000) + count)));
        const movement = Math.max(1, Math.round(110 + count * 24 + 18 * Math.sin(Date.now() / 260000)));
        const sleep = Math.max(4.5, Math.min(9.2, 6.7 + count * 0.23));
        const stress = Math.max(0.05, Math.min(0.9, 0.65 - (hrv / 180)));

        const sample = {
            timestamp: now.toISOString(),
            heart_rate: hr,
            hrv,
            movement,
            sleep_hours: Number(sleep.toFixed(2)),
            stress_index: Number(stress.toFixed(3)),
        };

        const sampleKey = userBiometricSamplesKey(profile.email);
        const rows = readJsonStorage(sampleKey, []);
        rows.push(sample);
        writeJsonStorage(sampleKey, rows.slice(-96));

        writeJsonStorage(userScopedKey(profile.email, 'wearables_sync_meta'), {
            last_sync_at: sample.timestamp,
            connected_count: count,
        });

        return {
            status: 'success',
            message: `Sincronizzazione completata: ${count} provider aggiornati.`,
            synced_providers: connected,
            sample,
            timestamp: sample.timestamp,
        };
    }

    if (path === '/api/biometric/manual' && method === 'POST') {
        const profile = getLocalProfileFromToken();
        if (!profile) throw new Error('Sessione non valida');

        const heartRate = Number(payload.heart_rate);
        const hrv = Number(payload.hrv);
        const sleepHours = Number(payload.sleep_hours);
        const movement = Number(payload.movement);

        if (!Number.isFinite(heartRate) || !Number.isFinite(hrv) || !Number.isFinite(sleepHours) || !Number.isFinite(movement)) {
            throw new Error('Valori manuali non validi');
        }

        const sample = {
            timestamp: new Date().toISOString(),
            heart_rate: Math.round(heartRate),
            hrv: Number(hrv.toFixed(1)),
            movement: Number(movement.toFixed(1)),
            sleep_hours: Number(sleepHours.toFixed(2)),
            stress_index: Number(Math.max(0.05, Math.min(0.95, 0.65 - (hrv / 180))).toFixed(3)),
            source: 'manual',
        };

        const sampleKey = userBiometricSamplesKey(profile.email);
        const rows = readJsonStorage(sampleKey, []);
        rows.push(sample);
        writeJsonStorage(sampleKey, rows.slice(-96));

        writeJsonStorage(userScopedKey(profile.email, 'wearables_sync_meta'), {
            last_sync_at: sample.timestamp,
            connected_count: readJsonStorage(userScopedKey(profile.email, 'wearables'), []).length,
            source: 'manual-entry',
        });

        return {
            status: 'success',
            message: 'Valori manuali salvati e inclusi nella dashboard.',
            sample,
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

function readUsernameFromToken(token) {
    if (!token) return '';
    if (token.startsWith('local.')) {
        const profile = getLocalProfileFromToken();
        return profile?.email || '';
    }
    const parts = token.split('.');
    if (parts.length < 2) return '';
    try {
        const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4);
        const payload = JSON.parse(atob(normalized));
        return payload?.sub || '';
    } catch {
        return '';
    }
}

function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
    if (isStaticPagesApiBase() && isLocalFallbackEnabled()) {
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

function supportsPasskey() {
    return Boolean(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && navigator.credentials.get);
}

function canUsePasskeyWithCurrentSetup() {
    if (!supportsPasskey()) {
        return { ok: false, reason: 'Passkey non supportata su questo browser/dispositivo.' };
    }
    if (!window.isSecureContext) {
        return { ok: false, reason: 'Passkey richiede HTTPS o localhost (contesto sicuro).' };
    }
    if (isStaticPagesApiBase() && !isLocalFallbackEnabled()) {
        return { ok: false, reason: 'Passkey richiede backend API reale. Imposta api_base verso il tuo backend.' };
    }

    if (isStaticPagesApiBase() && isLocalFallbackEnabled()) {
        return { ok: true, reason: '' };
    }

    return { ok: true, reason: '' };
}

function base64urlToUint8Array(base64url) {
    const padded = `${base64url}`.replace(/-/g, '+').replace(/_/g, '/');
    const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4);
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function arrayBufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomBase64url(size = 32) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return arrayBufferToBase64url(bytes.buffer);
}

function utf8Base64url(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    return arrayBufferToBase64url(bytes.buffer);
}

function preparePasskeyCreationOptions(options) {
    const next = structuredClone(options);
    next.challenge = base64urlToUint8Array(next.challenge);
    if (next.user && next.user.id) {
        next.user.id = base64urlToUint8Array(next.user.id);
    }
    if (Array.isArray(next.excludeCredentials)) {
        next.excludeCredentials = next.excludeCredentials.map((entry) => ({
            ...entry,
            id: base64urlToUint8Array(entry.id),
        }));
    }
    return next;
}

function preparePasskeyRequestOptions(options) {
    const next = structuredClone(options);
    next.challenge = base64urlToUint8Array(next.challenge);
    if (Array.isArray(next.allowCredentials)) {
        next.allowCredentials = next.allowCredentials.map((entry) => ({
            ...entry,
            id: base64urlToUint8Array(entry.id),
        }));
    }
    return next;
}

function serializeCredentialForApi(credential) {
    const response = credential.response || {};
    const payload = {
        id: credential.id,
        rawId: arrayBufferToBase64url(credential.rawId),
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
        response: {
            clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
        },
    };

    if (response.attestationObject) {
        payload.response.attestationObject = arrayBufferToBase64url(response.attestationObject);
        payload.response.transports = response.getTransports ? response.getTransports() : [];
    }

    if (response.authenticatorData) {
        payload.response.authenticatorData = arrayBufferToBase64url(response.authenticatorData);
    }
    if (response.signature) {
        payload.response.signature = arrayBufferToBase64url(response.signature);
    }
    if (response.userHandle) {
        payload.response.userHandle = arrayBufferToBase64url(response.userHandle);
    }

    return payload;
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

async function renderWearableSyncStatus() {
    const statusEl = document.getElementById('wearableSyncStatus');
    if (!statusEl) return;

    try {
        const providers = await api('/api/wearable/providers');
        const syncTimes = providers.items
            .map((i) => i.last_sync_at)
            .filter(Boolean)
            .map((v) => new Date(v).getTime())
            .filter((v) => Number.isFinite(v));

        if (!syncTimes.length) {
            statusEl.textContent = 'Nessuna sincronizzazione recente.';
            return;
        }

        const lastSyncTs = Math.max(...syncTimes);
        statusEl.textContent = `Ultima sync: ${new Date(lastSyncTs).toLocaleString()}`;
    } catch {
        statusEl.textContent = 'Stato sincronizzazione non disponibile.';
    }
}

function bindWearableSyncButton() {
    const syncBtn = document.getElementById('wearableSyncNowBtn');
    const statusEl = document.getElementById('wearableSyncStatus');
    if (!syncBtn) return;

    syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Sincronizzazione in corso...';
        try {
            const result = await api('/api/wearable/sync', { method: 'POST' });
            if (statusEl) {
                const ts = result.timestamp ? new Date(result.timestamp).toLocaleString() : 'adesso';
                statusEl.textContent = `${result.message || 'Sync completata'} (${ts})`;
            }
            await renderWearableProviders();
        } catch (err) {
            if (statusEl) statusEl.textContent = `Sync non riuscita: ${err.message}`;
        } finally {
            syncBtn.disabled = false;
            await renderWearableSyncStatus();
        }
    });
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

function readDateTimeLocalAsIso(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
}

function buildRangeQuery(startIso, endIso) {
    const params = new URLSearchParams();
    if (startIso) params.set('start', startIso);
    if (endIso) params.set('end', endIso);
    const query = params.toString();
    return query ? `?${query}` : '';
}

function formatRangeLabel(startIso, endIso) {
    const from = startIso ? new Date(startIso).toLocaleString() : 'inizio';
    const to = endIso ? new Date(endIso).toLocaleString() : 'adesso';
    return `${from} -> ${to}`;
}

function renderV2RiskHistory(items) {
    const list = document.getElementById('v2HistoryList');
    if (!list) return;
    if (!items || !items.length) {
        list.innerHTML = '<p class="muted">Nessun dato nello storico per l\'intervallo selezionato.</p>';
        return;
    }

    list.innerHTML = items.map((item) => {
        const pct = Math.round(Number(item.risk_score || 0) * 100);
        const level = riskLabel(Number(item.risk_score || 0)).toLowerCase();
        return `
            <div class="card" style="padding:0.55rem; margin-bottom:0.45rem;">
                <div style="display:flex; justify-content:space-between; gap:0.6rem; align-items:center;">
                    <span class="muted">${new Date(item.timestamp).toLocaleString()}</span>
                    <strong class="risk-${level}">${pct}%</strong>
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

function openPrintableReport({ username, riskScore, riskMessage, therapies, events, rangeLabel, historyRows }) {
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
        ${rangeLabel ? `<p><strong>Intervallo:</strong> ${rangeLabel}</p>` : ''}
        <p><strong>Rischio attuale:</strong> ${(riskScore * 100).toFixed(1)}% (${riskLabel(riskScore)})</p>
        <p><strong>Messaggio AI:</strong> ${riskMessage}</p>
        ${Array.isArray(historyRows) && historyRows.length ? `<h2>Storico rischio</h2><ul>${historyRows.map((h) => `<li>${new Date(h.timestamp).toLocaleString()} - ${(Number(h.risk_score || 0) * 100).toFixed(1)}%</li>`).join('')}</ul>` : ''}
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

function renderAlertLog(username) {
    const list = document.getElementById('alertLogList');
    if (!list) return;

    const rows = readDashboardList(username, 'alerts');
    if (!rows.length) {
        list.innerHTML = '<p class="muted">Nessun alert registrato.</p>';
        return;
    }

    list.innerHTML = rows.slice(0, 8).map((row) => `
        <div class="card" style="padding:0.55rem; margin-bottom:0.45rem;">
            <p class="muted" style="margin:0 0 0.2rem 0;">${new Date(row.when).toLocaleString()}</p>
            <p style="margin:0; color:#e0e0e0;">${row.message}</p>
        </div>
    `).join('');
}

function shouldEmitAlert(username, message) {
    const last = readDashboardList(username, 'alert_last_emit')[0];
    const now = Date.now();
    if (last && last.message === message && (now - Number(last.when || 0)) < 10 * 60 * 1000) {
        return false;
    }
    writeDashboardList(username, 'alert_last_emit', [{ message, when: now }]);
    return true;
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
    if (!shouldEmitAlert(username, message)) {
        if (statusEl) {
            statusEl.textContent = `Alert gia' registrato di recente: ${message}`;
        }
        return;
    }

    pushAlertEvent(username, message);
    renderAlertLog(username);
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

function setDataQualityBadge(username) {
    const badge = document.getElementById('dataSourceBadge');
    if (!badge) return;

    const bleInfo = readJsonStorage(userScopedKey(username, 'bridge_ble_meta'), null);
    const manualInfo = readJsonStorage(userScopedKey(username, 'manual_biometric_meta'), null);
    const isStatic = isStaticPagesApiBase();
    const now = Date.now();
    const bleRecent = bleInfo?.last_bridge_at && (now - new Date(bleInfo.last_bridge_at).getTime()) < 48 * 3600 * 1000;
    const manualRecent = manualInfo?.last_manual_at && (now - new Date(manualInfo.last_manual_at).getTime()) < 48 * 3600 * 1000;

    if (bleRecent) {
        badge.textContent = `Qualita dato: bridge BLE (${new Date(bleInfo.last_bridge_at).toLocaleString()})`;
        return;
    }

    if (manualRecent) {
        badge.textContent = `Qualita dato: manuale (${new Date(manualInfo.last_manual_at).toLocaleString()})`;
        return;
    }

    if (!isStatic) {
        badge.textContent = 'Qualita dato: reale API';
        return;
    }

    badge.textContent = 'Qualita dato: simulazione demo';
}

function getDataQualityState(username) {
    const bleInfo = readJsonStorage(userScopedKey(username, 'bridge_ble_meta'), null);
    const manualInfo = readJsonStorage(userScopedKey(username, 'manual_biometric_meta'), null);
    const isStatic = isStaticPagesApiBase();
    const now = Date.now();
    const bleRecent = bleInfo?.last_bridge_at && (now - new Date(bleInfo.last_bridge_at).getTime()) < 48 * 3600 * 1000;
    const manualRecent = manualInfo?.last_manual_at && (now - new Date(manualInfo.last_manual_at).getTime()) < 48 * 3600 * 1000;

    if (bleRecent) return { mode: 'bridge_ble', timestamp: bleInfo.last_bridge_at };
    if (manualRecent) return { mode: 'manual', timestamp: manualInfo.last_manual_at };
    if (!isStatic) return { mode: 'real_api', timestamp: null };
    return { mode: 'sim_demo', timestamp: null };
}

function updateBleIndicator(mode) {
    const dot = document.getElementById('bleIndicator');
    const label = document.getElementById('bleIndicatorLabel');
    if (!dot || !label) return;

    dot.classList.remove('ble-indicator-on', 'ble-indicator-warn', 'ble-indicator-off');
    if (mode === 'on') {
        dot.classList.add('ble-indicator-on');
        label.textContent = 'BLE: attivo';
        return;
    }
    if (mode === 'warn') {
        dot.classList.add('ble-indicator-warn');
        label.textContent = 'BLE: parziale/fallback';
        return;
    }
    dot.classList.add('ble-indicator-off');
    label.textContent = 'BLE: non attivo';
}

function describeMobileBleRoute() {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    const secure = window.isSecureContext;
    const hasWebBluetooth = Boolean(navigator.bluetooth);

    if (isIOS) {
        return 'iPhone/iPad rilevato: Web Bluetooth non supportato in Safari. Strada consigliata: app companion (iOS) + Apple Health + sync backend.';
    }

    if (isAndroid && hasWebBluetooth && secure) {
        return 'Android compatibile: puoi usare subito il pulsante "Attiva Bluetooth assistito" (Chrome + HTTPS).';
    }

    if (isAndroid && !secure) {
        return 'Android rilevato ma contesto non sicuro: abilita HTTPS (o localhost) per usare Web Bluetooth.';
    }

    if (hasWebBluetooth) {
        return 'Web Bluetooth disponibile: prova "Attiva Bluetooth assistito". Se il watch non espone GATT, usa bridge app/OAuth provider.';
    }

    return 'Web Bluetooth non disponibile su questo browser: usa bridge tramite app mobile (Health Connect/Apple Health) o integrazione OAuth provider.';
}

function renderAlwaysOnAiPanel({ username, riskScore, hrCurrent, hrvCurrent, riskMessage }) {
    const statusEl = document.getElementById('aiPresenceStatus');
    const adviceEl = document.getElementById('aiPresenceAdvice');
    if (!statusEl || !adviceEl) return;

    const source = getDataQualityState(username);
    const sourceLabel = {
        real_api: 'reale API',
        bridge_ble: 'bridge BLE',
        manual: 'manuale',
        sim_demo: 'simulazione',
    }[source.mode] || 'sconosciuta';

    const hasVitals = Number.isFinite(hrCurrent) && Number.isFinite(hrvCurrent);
    const tips = [];

    if (!hasVitals) {
        tips.push('Dati vitali incompleti: non posso fare inferenze puntuali, usa sync o inserimento manuale.');
    } else {
        tips.push(`Segnali correnti disponibili: HR ${hrCurrent} bpm, HRV ${hrvCurrent} ms.`);
    }

    if (Number.isFinite(riskScore)) {
        if (riskScore >= 0.67) tips.push('Rischio alto: resta in ambiente sicuro e riduci stimoli intensi.');
        else if (riskScore >= 0.34) tips.push('Rischio medio: privilegia riposo, idratazione e ritmo regolare.');
        else tips.push('Rischio basso: continua monitoraggio e routine stabile.');
    } else {
        tips.push('Rischio non disponibile: non posso suggerire livello di cautela basato su score.');
    }

    if (riskMessage) {
        tips.push(`Sintesi corrente: ${riskMessage}`);
    }

    statusEl.textContent = `Stato AI: attivo 24/7 · Fonte dati: ${sourceLabel}${source.timestamp ? ` · ultimo update ${new Date(source.timestamp).toLocaleString()}` : ''}`;
    adviceEl.innerHTML = tips.map((t) => `<li class="muted">${t}</li>`).join('');
}

function buildDiaryAiComment(entry, riskScore) {
    const type = String(entry.type || '').toLowerCase();
    const notes = String(entry.notes || '').toLowerCase();
    if (type === 'crisi') {
        return riskScore >= 0.67
            ? 'Crisi in fase delicata: riduci stimoli, avvisa un caregiver e pianifica recupero nelle prossime ore.'
            : 'Crisi registrata: idratazione, riposo e monitoraggio. Condividi la voce con il medico alla prossima visita.';
    }
    if (type === 'aura') {
        return 'Aura annotata: interrompi attivita a rischio e cerca ambiente sicuro e tranquillo.';
    }
    if (notes.includes('stress') || notes.includes('ansia')) {
        return 'AI benessere: inserisci 2 pause respiratorie oggi e riduci carico serale.';
    }
    if (notes.includes('sonno') || notes.includes('dorm')) {
        return 'AI benessere: priorita sonno stanotte (7-8h) per stabilizzare il trend.';
    }
    return 'AI benessere: continua a tracciare i trigger, aiuta a capire pattern utili per stare meglio.';
}

function renderDiaryEntries(username, riskScore) {
    const diaryList = document.getElementById('diaryList');
    if (!diaryList) return;
    const entries = readDashboardList(username, 'diary');
    if (!entries.length) {
        diaryList.innerHTML = '<p class="muted">Nessuna voce diario inserita.</p>';
        return;
    }
    diaryList.innerHTML = entries.slice(0, 8).map((row) => `
        <div class="card" style="padding:0.6rem; margin-bottom:0.5rem;">
            <p class="muted" style="margin:0 0 0.2rem 0;">${new Date(row.when).toLocaleString()} · ${row.type}</p>
            <p style="margin:0 0 0.35rem 0;">${row.notes || 'Nessun dettaglio.'}</p>
            <p class="muted" style="margin:0;"><strong>AI:</strong> ${row.ai_comment || buildDiaryAiComment(row, riskScore)}</p>
        </div>
    `).join('');
}

function parseHeartRateMeasurement(dataView) {
    const flags = dataView.getUint8(0);
    const is16Bit = (flags & 0x01) === 0x01;
    if (is16Bit) {
        return dataView.getUint16(1, true);
    }
    return dataView.getUint8(1);
}

async function readHeartRateFromGatt(device, onStep) {
    const server = await device.gatt?.connect();
    if (!server) {
        throw new Error('Connessione GATT non disponibile');
    }

    try {
        onStep?.('Connessione GATT attiva, lettura frequenza cardiaca...');
        const service = await server.getPrimaryService('heart_rate');
        const characteristic = await service.getCharacteristic('heart_rate_measurement');

        // Primo tentativo: ascolto notifica per 8 secondi.
        let resolved = false;
        const hrFromNotification = await new Promise((resolve) => {
            const timeout = setTimeout(async () => {
                if (!resolved) {
                    resolved = true;
                    try {
                        await characteristic.stopNotifications();
                    } catch {}
                    resolve(null);
                }
            }, 8000);

            const onChanged = async (event) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                const value = event.target?.value;
                const hr = value ? parseHeartRateMeasurement(value) : null;
                try {
                    await characteristic.stopNotifications();
                } catch {}
                characteristic.removeEventListener('characteristicvaluechanged', onChanged);
                resolve(hr);
            };

            characteristic.addEventListener('characteristicvaluechanged', onChanged);
            characteristic.startNotifications().catch(() => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    characteristic.removeEventListener('characteristicvaluechanged', onChanged);
                    resolve(null);
                }
            });
        });

        if (Number.isFinite(hrFromNotification)) {
            return Number(hrFromNotification);
        }

        // Fallback: readValue diretto (non supportato da tutti i device HR).
        onStep?.('Notifica non ricevuta, tentativo lettura diretta...');
        const value = await characteristic.readValue();
        return Number(parseHeartRateMeasurement(value));
    } finally {
        try {
            server.disconnect();
        } catch {}
    }
}

async function startBleAssistedBridge(username, onStep) {
    if (!window.isSecureContext) {
        throw new Error('Bluetooth richiede HTTPS o localhost');
    }
    if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth non supportato su questo browser/dispositivo');
    }

    onStep?.('Apri selettore dispositivo Bluetooth...');
    const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['heart_rate', 'battery_service', 'device_information'],
    });

    let heartRate = null;
    try {
        heartRate = await readHeartRateFromGatt(device, onStep);
        onStep?.(`Frequenza cardiaca letta: ${heartRate} bpm`);
    } catch {
        onStep?.('Lettura HR non disponibile via browser: uso fallback guidato.');
    }

    const fallbackHr = heartRate ?? Number(prompt('Inserisci HR rilevato sul dispositivo (bpm):', '72') || 72);
    const hrv = Math.max(20, Math.min(95, Math.round(45 + (80 - Math.min(120, fallbackHr)) / 2)));
    const sleep = Number(prompt('Ore di sonno ultime 24h (opzionale):', '7.0') || 7.0);
    const movement = Number(prompt('Movimento/attivita (opzionale):', '120') || 120);

    await api('/api/biometric/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            heart_rate: Number.isFinite(fallbackHr) ? fallbackHr : 72,
            hrv,
            sleep_hours: Number.isFinite(sleep) ? sleep : 7.0,
            movement: Number.isFinite(movement) ? movement : 120,
        }),
    });

    writeJsonStorage(userScopedKey(username, 'bridge_ble_meta'), {
        device_name: device.name || 'BLE device',
        last_bridge_at: new Date().toISOString(),
        sample_hr: Number.isFinite(fallbackHr) ? fallbackHr : 72,
    });

    onStep?.('Bridge completato, dati inviati alla dashboard.');

    return {
        deviceName: device.name || 'BLE device',
        hr: Number.isFinite(fallbackHr) ? fallbackHr : 72,
    };
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
        const passkeyInfo = document.getElementById('passkeyInfo');
        const apiBaseInfo = document.getElementById('loginApiBase');
        const apiBaseInput = document.getElementById('apiBaseInput');
        if (apiBaseInfo) {
            apiBaseInfo.textContent = API_BASE;
        }
        if (isStaticPagesApiBase() && !isLocalFallbackEnabled()) {
            showError(error, 'Modalita demo locale disattivata: imposta un backend API reale per salvare dati e credenziali in database.');
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

        const passkeyEmailInput = document.getElementById('passkeyEmail');
        const passkeyRegisterBtn = document.getElementById('passkeyRegisterBtn');
        const passkeyLoginBtn = document.getElementById('passkeyLoginBtn');

        const setPasskeyInfo = (message) => {
            if (passkeyInfo) {
                passkeyInfo.textContent = message || '';
            }
        };

        const readPasskeyEmail = () => {
            const email = (passkeyEmailInput?.value || '').trim().toLowerCase();
            if (!email || !email.includes('@')) {
                throw new Error('Inserisci una email valida per usare la passkey');
            }
            return email;
        };

        const passkeySetup = canUsePasskeyWithCurrentSetup();
        if (!passkeySetup.ok) {
            if (passkeyRegisterBtn) passkeyRegisterBtn.disabled = true;
            if (passkeyLoginBtn) passkeyLoginBtn.disabled = true;
            setPasskeyInfo(passkeySetup.reason);
        }

        if (passkeyRegisterBtn) {
            passkeyRegisterBtn.addEventListener('click', async () => {
                showError(error, '');
                try {
                    const setup = canUsePasskeyWithCurrentSetup();
                    if (!setup.ok) {
                        throw new Error(setup.reason);
                    }

                    const email = readPasskeyEmail();
                    setPasskeyInfo('Preparazione registrazione passkey...');

                    const begin = await api('/auth/passkey/register/options', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email }),
                    });

                    const creationOptions = preparePasskeyCreationOptions(begin.options);
                    const credential = await navigator.credentials.create({ publicKey: creationOptions });
                    if (!credential) {
                        throw new Error('Registrazione passkey annullata');
                    }

                    await api('/auth/passkey/register/complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email,
                            credential: serializeCredentialForApi(credential),
                        }),
                    });

                    setPasskeyInfo('Passkey registrata. Ora puoi accedere con biometria.');
                } catch (err) {
                    setPasskeyInfo('');
                    showError(error, err.message || 'Registrazione passkey non riuscita');
                }
            });
        }

        if (passkeyLoginBtn) {
            passkeyLoginBtn.addEventListener('click', async () => {
                showError(error, '');
                try {
                    const setup = canUsePasskeyWithCurrentSetup();
                    if (!setup.ok) {
                        throw new Error(setup.reason);
                    }

                    const email = readPasskeyEmail();
                    setPasskeyInfo('Preparazione login passkey...');

                    const begin = await api('/auth/passkey/login/options', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email }),
                    });

                    const requestOptions = preparePasskeyRequestOptions(begin.options);
                    const assertion = await navigator.credentials.get({ publicKey: requestOptions });
                    if (!assertion) {
                        throw new Error('Accesso passkey annullato');
                    }

                    const res = await api('/auth/passkey/login/complete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email,
                            credential: serializeCredentialForApi(assertion),
                        }),
                    });

                    setToken(res.access_token);
                    goTo('/dashboard');
                } catch (err) {
                    setPasskeyInfo('');
                    showError(error, err.message || 'Login passkey non riuscito');
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

        const recoveryInfo = document.getElementById('recoveryInfo');
        const recoveryRequestForm = document.getElementById('passwordRecoveryRequestForm');
        if (recoveryRequestForm) {
            recoveryRequestForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('recoveryEmail').value.trim();
                showError(error, '');
                if (recoveryInfo) recoveryInfo.textContent = '';

                try {
                    const res = await api('/auth/password-recovery/request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email }),
                    });

                    if (recoveryInfo) {
                        const tokenHint = res.recovery_token
                            ? ` Token: ${res.recovery_token} (scade in circa ${Math.round((res.expires_in_seconds || 0) / 60)} min).`
                            : '';
                        recoveryInfo.textContent = `${res.message || 'Recovery avviato.'}${tokenHint}`;
                    }
                } catch (err) {
                    showError(error, err.message || 'Richiesta recovery non riuscita');
                }
            });
        }

        const recoveryConfirmForm = document.getElementById('passwordRecoveryConfirmForm');
        if (recoveryConfirmForm) {
            recoveryConfirmForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showError(error, '');

                const email = document.getElementById('recoveryEmail').value.trim();
                const recovery_token = document.getElementById('recoveryToken').value.trim();
                const new_password = document.getElementById('recoveryNewPassword').value;

                try {
                    const res = await api('/auth/password-recovery/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, recovery_token, new_password }),
                    });
                    if (recoveryInfo) {
                        recoveryInfo.textContent = res.message || 'Password aggiornata con successo.';
                    }
                    recoveryConfirmForm.reset();
                } catch (err) {
                    showError(error, err.message || 'Conferma recovery non riuscita');
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
        const apiBaseInfo = document.getElementById('appDownloadApiBaseInfo');
        const apiBaseInput = document.getElementById('appDownloadApiBaseInput');
        const apiBaseForm = document.getElementById('appDownloadApiBaseForm');
        if (apiBaseInfo) {
            apiBaseInfo.textContent = API_BASE;
        }
        if (apiBaseInput) {
            apiBaseInput.value = localStorage.getItem(API_BASE_STORAGE_KEY) || '';
        }
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
                    alert('Inserisci un URL backend valido (http:// o https://).');
                    return;
                }
                localStorage.setItem(API_BASE_STORAGE_KEY, raw.replace(/\/$/, ''));
                window.location.reload();
            });
        }

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
        const apkStatusMessage = document.getElementById('apkStatusMessage');
        const directApkUrl = `${API_BASE}${LOCAL_APK_PATH}`;
        const staticPagesMode = isStaticPagesApiBase();
        const pagesBasePath = appBasePath();
        const pagesRepoBase = pagesBasePath.endsWith('/frontend')
            ? pagesBasePath.slice(0, -'/frontend'.length)
            : pagesBasePath;
        const staticApkUrl = `${window.location.origin}${pagesRepoBase}/wear-app/app/build/outputs/apk/debug/app-debug.apk`;
        let apkReady = false;
        let apkTargetUrl = '';
        let apkBuildHint = '';

        if (staticPagesMode) {
            apkReady = true;
            apkTargetUrl = staticApkUrl;
        } else {
            try {
                const apkStatus = await api('/app/apk/status');
                apkReady = Boolean(apkStatus && apkStatus.available);
                if (apkReady) {
                    apkTargetUrl = apkStatus.apk_url || directApkUrl;
                } else {
                    apkBuildHint = apkStatus?.build_hint || '';
                }
            } catch {
                apkReady = false;
            }
        }

        const useDirectApk = apkReady;
        if (apkDownloadLink) {
            if (useDirectApk) {
                apkDownloadLink.href = apkTargetUrl;
                apkDownloadLink.textContent = 'Scarica APK locale (consigliato)';
            } else {
                apkDownloadLink.href = directApkUrl;
                apkDownloadLink.textContent = 'Prova download APK locale';
            }
        }

        const storeLink = document.getElementById('smartStoreLink');
        if (storeLink) {
            if (useDirectApk) {
                storeLink.href = apkTargetUrl;
                storeLink.textContent = 'Apri download APK consigliato';
            } else {
                storeLink.href = appStoreUrl();
                storeLink.textContent = 'Apri store consigliato';
            }
        }

        const qrImage = document.getElementById('appQrImage');
        if (qrImage) {
            if (useDirectApk) {
                qrImage.src = qrImageUrl(apkTargetUrl);
            } else {
                qrImage.src = qrImageUrl(directApkUrl);
            }
        }

        const apkQrHint = document.getElementById('apkQrHint');
        if (apkQrHint) {
            if (useDirectApk && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                apkQrHint.textContent = 'Per scansione da telefono usa l\'IP LAN del PC (es. http://192.168.x.x:8000/app).';
            } else if (staticPagesMode) {
                apkQrHint.textContent = 'Su GitHub Pages il QR scarica direttamente l\'APK statico pubblicato nel repository.';
            } else if (!useDirectApk) {
                apkQrHint.textContent = 'APK locale non confermato dal backend: il QR prova comunque il download diretto.';
            } else {
                apkQrHint.textContent = 'QR configurato su backend API reale: usa questo codice per installazione e sync.';
            }
        }

        if (apkStatusMessage) {
            if (useDirectApk) {
                apkStatusMessage.textContent = 'APK disponibile: usa il pulsante o il QR per installazione immediata.';
            } else if (staticPagesMode) {
                apkStatusMessage.textContent = 'GitHub Pages attivo: download diretto APK statico abilitato.';
            } else if (apkBuildHint) {
                apkStatusMessage.textContent = `APK non trovato sul backend. Comando consigliato: ${apkBuildHint}`;
            } else {
                apkStatusMessage.textContent = 'Impossibile verificare lo stato APK dal backend in questo momento.';
            }
        }

        if (isMobileBrowser()) {
            const mobileNotice = document.getElementById('mobileRedirectNotice');
            if (mobileNotice) mobileNotice.classList.remove('hidden');
            setTimeout(() => {
                window.location.href = useDirectApk ? apkTargetUrl : directApkUrl;
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
        setDataQualityBadge(dashboardUser);

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

        const diaryForm = document.getElementById('diaryEntryForm');
        if (diaryForm) {
            diaryForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const entry = {
                    id: `dr-${Date.now()}`,
                    when: document.getElementById('diaryWhen').value || new Date().toISOString(),
                    type: document.getElementById('diaryType').value,
                    notes: document.getElementById('diaryNotes').value.trim(),
                };
                entry.ai_comment = buildDiaryAiComment(entry, lastRiskScore);
                const list = readDashboardList(dashboardUser, 'diary');
                list.unshift(entry);
                writeDashboardList(dashboardUser, 'diary', list.slice(0, 40));
                diaryForm.reset();
                renderDiaryEntries(dashboardUser, lastRiskScore);
            });
        }

        const manualBiometricForm = document.getElementById('manualBiometricForm');
        const manualBiometricStatus = document.getElementById('manualBiometricStatus');
        if (manualBiometricForm) {
            manualBiometricForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const heart_rate = Number(document.getElementById('manualHeartRate').value);
                const hrv = Number(document.getElementById('manualHrv').value);
                const sleep_hours = Number(document.getElementById('manualSleepHours').value);
                const movement = Number(document.getElementById('manualMovement').value);

                try {
                    await api('/api/biometric/manual', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ heart_rate, hrv, sleep_hours, movement }),
                    });
                    writeJsonStorage(userScopedKey(dashboardUser, 'manual_biometric_meta'), {
                        last_manual_at: new Date().toISOString(),
                    });
                    if (manualBiometricStatus) {
                        manualBiometricStatus.textContent = 'Valori manuali salvati e attivi in dashboard.';
                    }
                    setDataQualityBadge(dashboardUser);
                } catch (err) {
                    if (manualBiometricStatus) {
                        manualBiometricStatus.textContent = `Errore salvataggio valori: ${err.message}`;
                    }
                }
            });
        }

        const bridgeBtn = document.getElementById('bridgeBleAssistBtn');
        const bridgeStatus = document.getElementById('bridgeBleStatus');
        const dashboardBleRouteStatus = document.getElementById('mobileBleRouteStatus');
        if (dashboardBleRouteStatus) {
            dashboardBleRouteStatus.textContent = describeMobileBleRoute();
        }
        const dashboardBleMeta = readJsonStorage(userScopedKey(dashboardUser, 'bridge_ble_meta'), null);
        updateBleIndicator(dashboardBleMeta?.last_bridge_at ? 'warn' : 'off');
        if (bridgeBtn) {
            bridgeBtn.addEventListener('click', async () => {
                bridgeBtn.disabled = true;
                updateBleIndicator('warn');
                if (bridgeStatus) bridgeStatus.textContent = 'Bridge BLE in corso...';
                try {
                    const out = await startBleAssistedBridge(dashboardUser, (step) => {
                        if (bridgeStatus) bridgeStatus.textContent = step;
                    });
                    if (bridgeStatus) {
                        bridgeStatus.textContent = `Bridge completato con ${out.deviceName} (HR ${out.hr} bpm).`;
                    }
                    updateBleIndicator('on');
                    setDataQualityBadge(dashboardUser);
                } catch (err) {
                    const raw = String(err?.message || 'Errore sconosciuto');
                    let hint = raw;
                    if (raw.includes('User cancelled the requestDevice') || raw.includes('NotFoundError')) {
                        hint = 'Nessun dispositivo selezionato. Riapri il bridge e scegli smartwatch o fascia cardiaca dalla lista Bluetooth.';
                    } else if (raw.includes('Bluetooth') && raw.includes('denied')) {
                        hint = 'Permesso Bluetooth negato. Abilita Bluetooth nel browser e riprova.';
                    } else if (raw.includes('HTTPS') || raw.includes('contesto sicuro')) {
                        hint = 'Per usare Bluetooth servono HTTPS o localhost. Su Pages usa Companion App se il browser non supporta BLE.';
                    }
                    if (bridgeStatus) {
                        bridgeStatus.textContent = `Bridge non riuscito: ${hint}`;
                    }
                    updateBleIndicator('off');
                } finally {
                    bridgeBtn.disabled = false;
                }
            });
        }

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

        renderAlertLog(dashboardUser);
        const clearAlertLogBtn = document.getElementById('clearAlertLogBtn');
        if (clearAlertLogBtn) {
            clearAlertLogBtn.addEventListener('click', () => {
                writeDashboardList(dashboardUser, 'alerts', []);
                renderAlertLog(dashboardUser);
                const statusEl = document.getElementById('alertStatusText');
                if (statusEl) {
                    statusEl.textContent = 'Log alert azzerato.';
                }
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
                    rangeLabel: 'Ultime 24h',
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
        renderAlwaysOnAiPanel({
            username: dashboardUser,
            riskScore: lastRiskScore,
            hrCurrent,
            hrvCurrent,
            riskMessage: lastRiskMessage,
        });
        renderDiaryEntries(dashboardUser, lastRiskScore);
        evaluateAlertRules({
            username: dashboardUser,
            rules: getAlertRules(dashboardUser),
            riskScore: lastRiskScore,
            hrCurrent,
            hrvCurrent,
        });
    }

    if (page === 'dashboard-v2') {
        const token = getToken();
        if (!token) {
            goTo('/login');
            return;
        }

        const derivedUsername = readUsernameFromToken(token) || 'utente';

        const statusEl = document.getElementById('v2Status');
        const startInput = document.getElementById('v2RangeStart');
        const endInput = document.getElementById('v2RangeEnd');
        const applyBtn = document.getElementById('v2ApplyRangeBtn');
        const resetBtn = document.getElementById('v2ResetRangeBtn');
        const exportCsvBtn = document.getElementById('v2ExportCsvBtn');
        const exportPdfBtn = document.getElementById('v2ExportPdfBtn');
        const logoutBtn = document.getElementById('logout-btn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', (event) => {
                event.preventDefault();
                clearSession();
                goTo('/login');
            });
        }

        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
        if (startInput) startInput.value = dayAgo.toISOString().slice(0, 16);
        if (endInput) endInput.value = now.toISOString().slice(0, 16);

        let lastHistoryRows = [];
        let lastRiskScore = 0;
        let lastRiskMessage = 'Nessun dato';

        const drawRiskChartV2 = (rows) => {
            const canvas = document.getElementById('risk-chart');
            if (!canvas || typeof Chart === 'undefined') return;
            const labels = rows.map((d) => new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            const values = rows.map((d) => Number(d.risk_score || 0));
            if (riskV2Chart) riskV2Chart.destroy();
            riskV2Chart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Punteggio Rischio',
                        data: values,
                        borderColor: 'rgba(255, 99, 132, 1)',
                        backgroundColor: 'rgba(255, 99, 132, 0.2)',
                        fill: true,
                        tension: 0.3,
                    }],
                },
                options: { responsive: true, scales: { y: { beginAtZero: true, max: 1 } } },
            });
        };

        const drawPhysioChartV2 = async () => {
            const data = await api('/api/physiological-summary');
            document.getElementById('current-hr').textContent = Array.isArray(data.hr) && data.hr.length ? `${data.hr[data.hr.length - 1]} bpm` : 'N/D';
            document.getElementById('current-hrv').textContent = Array.isArray(data.hrv) && data.hrv.length ? `${data.hrv[data.hrv.length - 1]} ms` : 'N/D';

            const canvas = document.getElementById('physiological-chart');
            if (!canvas || typeof Chart === 'undefined') return;
            if (physiologicalV2Chart) physiologicalV2Chart.destroy();
            physiologicalV2Chart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: (data.labels || []).slice(),
                    datasets: [
                        { label: 'Battito Cardiaco (bpm)', data: (data.hr || []).slice(), borderColor: 'rgba(54, 162, 235, 1)', yAxisID: 'y' },
                        { label: 'HRV (ms)', data: (data.hrv || []).slice(), borderColor: 'rgba(75, 192, 192, 1)', yAxisID: 'y1' },
                    ],
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { type: 'linear', display: true, position: 'left' },
                        y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } },
                    },
                },
            });
        };

        const drawMedicationChartV2 = async () => {
            const data = await api('/api/medication-impact');
            const canvas = document.getElementById('medication-impact-chart');
            if (!canvas || typeof Chart === 'undefined') return;
            if (medicationV2Chart) medicationV2Chart.destroy();
            medicationV2Chart = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.labels || [],
                    datasets: [
                        { label: 'Rischio con Farmaco', data: data.with_medication || [], backgroundColor: 'rgba(75, 192, 192, 0.6)' },
                        { label: 'Rischio senza Farmaco (stimato)', data: data.without_medication || [], backgroundColor: 'rgba(255, 99, 132, 0.6)' },
                    ],
                },
                options: { responsive: true, scales: { y: { beginAtZero: true, max: 1 } } },
            });
        };

        const loadRiskRange = async () => {
            const startIso = readDateTimeLocalAsIso(startInput?.value || '');
            const endIso = readDateTimeLocalAsIso(endInput?.value || '');
            if (startIso && endIso && new Date(startIso) > new Date(endIso)) {
                if (statusEl) statusEl.textContent = 'Intervallo non valido: la data di inizio supera la fine.';
                return;
            }
            const query = buildRangeQuery(startIso, endIso);
            const rows = await api(`/api/risk-history${query}`);
            lastHistoryRows = Array.isArray(rows) ? rows : [];

            renderV2RiskHistory(lastHistoryRows);
            drawRiskChartV2(lastHistoryRows);

            const last = lastHistoryRows.length ? lastHistoryRows[lastHistoryRows.length - 1] : null;
            lastRiskScore = Number(last?.risk_score || 0);
            lastRiskMessage = last ? `Ultimo rischio ${Math.round(lastRiskScore * 100)}%` : 'Nessun dato nel range selezionato';

            const riskEl = document.getElementById('current-risk');
            if (riskEl) riskEl.textContent = last ? `${(lastRiskScore * 100).toFixed(1)}%` : 'N/D';
            if (statusEl) statusEl.textContent = `Storico aggiornato: ${lastHistoryRows.length} punti in ${formatRangeLabel(startIso, endIso)}.`;
        };

        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                try {
                    await loadRiskRange();
                } catch (err) {
                    if (statusEl) statusEl.textContent = `Errore caricamento storico: ${err.message}`;
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                const resetNow = new Date();
                const resetDayAgo = new Date(resetNow.getTime() - 24 * 3600 * 1000);
                if (startInput) startInput.value = resetDayAgo.toISOString().slice(0, 16);
                if (endInput) endInput.value = resetNow.toISOString().slice(0, 16);
                try {
                    await loadRiskRange();
                } catch (err) {
                    if (statusEl) statusEl.textContent = `Errore reset storico: ${err.message}`;
                }
            });
        }

        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', async () => {
                try {
                    const startIso = readDateTimeLocalAsIso(startInput?.value || '');
                    const endIso = readDateTimeLocalAsIso(endInput?.value || '');
                    const token = getToken();
                    const query = buildRangeQuery(startIso, endIso);
                    const response = await fetch(`${API_BASE}/api/export/risk-history.csv${query}`, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    if (!response.ok) {
                        throw new Error(`Export non riuscito (${response.status})`);
                    }
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'risk-history.csv';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    if (statusEl) statusEl.textContent = `Export CSV completato per ${formatRangeLabel(startIso, endIso)}.`;
                } catch (err) {
                    if (statusEl) statusEl.textContent = `Errore export CSV: ${err.message}`;
                }
            });
        }

        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                const startIso = readDateTimeLocalAsIso(startInput?.value || '');
                const endIso = readDateTimeLocalAsIso(endInput?.value || '');
                openPrintableReport({
                    username: derivedUsername,
                    riskScore: lastRiskScore,
                    riskMessage: lastRiskMessage,
                    therapies: [],
                    events: [],
                    rangeLabel: formatRangeLabel(startIso, endIso),
                    historyRows: lastHistoryRows,
                });
            });
        }

        try {
            await Promise.all([loadRiskRange(), drawPhysioChartV2(), drawMedicationChartV2()]);
        } catch (err) {
            if (statusEl) statusEl.textContent = `Errore inizializzazione dashboard avanzata: ${err.message}`;
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
        bindWearableSyncButton();
        await renderWearableSyncStatus();

        const bleBtn = document.getElementById('wearableBleAssistBtn');
        const bleStatus = document.getElementById('wearableBleAssistStatus');
        const mobileBleRouteStatus = document.getElementById('mobileBleRouteStatus');
        if (mobileBleRouteStatus) {
            mobileBleRouteStatus.textContent = describeMobileBleRoute();
        }
        const bleMeta = readJsonStorage(userScopedKey(user.username || 'user', 'bridge_ble_meta'), null);
        updateBleIndicator(bleMeta?.last_bridge_at ? 'warn' : 'off');
        if (bleBtn) {
            bleBtn.addEventListener('click', async () => {
                bleBtn.disabled = true;
                if (bleStatus) {
                    bleStatus.textContent = 'Apertura selettore Bluetooth...';
                }
                updateBleIndicator('warn');
                try {
                    const out = await startBleAssistedBridge(user.username || 'user');
                    if (bleStatus) {
                        bleStatus.textContent = `Bridge BLE completato con ${out.deviceName} (HR ${out.hr} bpm).`;
                    }
                    updateBleIndicator('on');
                    await renderWearableSyncStatus();
                } catch (err) {
                    if (bleStatus) {
                        bleStatus.textContent = `Bridge BLE non riuscito: ${err.message}`;
                    }
                    updateBleIndicator('off');
                } finally {
                    bleBtn.disabled = false;
                }
            });
        }
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
