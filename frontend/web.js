const API_BASE = window.location.origin;
const TOKEN_KEY = 'authToken';

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
        window.location.href = '/login';
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

async function initGoogleButton(targetId, onCredential) {
    const box = document.getElementById(targetId);
    if (!box) return;

    const config = await fetch(`${API_BASE}/auth/google-config`).then((r) => r.json());
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
        window.location.href = '/login';
        return null;
    }

    if (allowedTypes.length && !allowedTypes.includes(profile.account_type)) {
        if (profile.account_type === 'provider') {
            window.location.href = '/provider';
        } else {
            window.location.href = '/dashboard';
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
        window.location.href = '/provider';
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
    return `${window.location.origin}${LOCAL_APK_PATH}`;
}

function appStoreUrl() {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        return IOS_STORE_URL;
    }
    return ANDROID_STORE_URL;
}

async function boot() {
    bindLogout();
    const page = document.body.dataset.page;
    const profile = await loadProfile();
    updateNav(profile);

    if (page === 'login') {
        const error = document.getElementById('loginError');
        try {
            await initGoogleButton('googlePatientButton', async (response) => {
                try {
                    await loginWithGoogle(response.credential);
                    window.location.href = '/dashboard';
                } catch (err) {
                    showError(error, err.message);
                }
            });
        } catch (err) {
            showError(error, err.message || 'Google Sign-In non disponibile');
        }
    }

    if (page === 'login-provider') {
        const error = document.getElementById('providerLoginError');
        try {
            await initGoogleButton('googleProviderButton', async (response) => {
                try {
                    await loginWithGoogle(response.credential);
                    const status = await api('/api/provider/status');
                    window.location.href = status.verified ? '/provider/dashboard' : '/provider';
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
                    window.location.href = status.verified ? '/provider/dashboard' : '/provider';
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
            apkDownloadLink.href = LOCAL_APK_PATH;
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
                    window.location.href = '/login';
                } catch (err) {
                    alert(err.message);
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
                window.location.href = '/provider/dashboard';
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
