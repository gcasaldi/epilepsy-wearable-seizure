# Epilepsy Wearable Seizure Prediction

🧠 **Sistema di predizione crisi epilettiche in tempo reale** con accesso Google privato, dashboard web e monitoraggio Wear OS.

## 🎯 Funzionalità

- ✅ **Accesso privato con Google Sign-In** + JWT applicativo
- ✅ **API protetta** - tutti gli endpoint richiedono login
- ✅ **Dashboard web** con visualizzazione rischio in tempo reale
- ✅ **Algoritmo predittivo** basato su parametri fisiologici
- ✅ **Telemetria estesa da wearable** (HR, HRV, SpO₂, respirazione, temperatura, passi, stress)
- ✅ **Codifica a colori** (verde/giallo/rosso) per rischio
- ✅ **Invio automatico** opzionale ogni 5 secondi
- ✅ **Password hashate** con bcrypt (mai salvate in chiaro)

## 🧭 Architettura ruoli/consensi

- Specifica tecnica pronta sviluppo: [docs/architecture-rbac-consent.md](docs/architecture-rbac-consent.md)
- Sicurezza account/recovery/audit: [docs/security-account-lifecycle.md](docs/security-account-lifecycle.md)
- Enterprise hardening (multi-istanza): [docs/enterprise-hardening-mini-spec.md](docs/enterprise-hardening-mini-spec.md)

## 📋 Prerequisiti

- Python 3.8+
- pip

## 🚀 Installazione

### 1. Clone del repository

```bash
git clone https://github.com/gcasaldi/epilepsy-wearable-seizure.git
cd epilepsy-wearable-seizure
```

### 2. Installa dipendenze

```bash
pip install -r requirements.txt
```

### 3. Configura Google + sicurezza backend

Genera l'hash della password:

```bash
python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['bcrypt']).hash('EpilepSy2025!Secure'))"
```

Crea il file `.env` nella root del progetto:

```bash
cp .env.example .env
```

Modifica `.env` e inserisci hash + Google Client ID:

```env
SECRET_KEY=your-super-secret-key-change-in-production-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<hash-generato-sopra>
GOOGLE_CLIENT_ID=<client-id-google-web-apps.googleusercontent.com>

DEBUG=True
```

Per creare il `GOOGLE_CLIENT_ID` usa Google Cloud Console → OAuth 2.0 Client ID (tipo Web Application), aggiungendo l'origine locale (es. `http://localhost:8000`).

### 4. Avvia il server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Oppure:

```bash
python -m app.main
```

Il server sarà disponibile su: **http://localhost:8000**

## 🌐 Utilizzo

### Frontend Web

1. Apri il browser su: **http://localhost:8000/static/index.html**
2. Accedi con **Google** (nessun form locale)
3. Inserisci i parametri fisiologici o attiva l'invio automatico
4. Visualizza il rischio in tempo reale e usa il link per aprire/scaricare l'app Wear

### Credenziali demo (sviluppo)

- Utente personale: `demo.user@epilepsy.local` / `DemoUser2026!`
- Ente sanitario demo: `demo.ente@epilepsy.local` / `DemoEnte2026!`

Verifica differenza profili con endpoint protetto `GET /api/me`:
- l'utente personale restituisce `account_type=personal`
- l'utente ente demo restituisce `account_type=provider` e provisioning ente verificato (ruolo admin) lato DB

### API Endpoints

#### 🔓 Pubblici (no auth)

**GET `/auth/google-config`** - Config pubblica per Google Sign-In frontend

**POST `/auth/google`** - Login con Google ID token

```bash
curl -X POST http://localhost:8000/auth/google \
  -H "Content-Type: application/json" \
  -d '{"credential":"GOOGLE_ID_TOKEN"}'
```

**POST `/auth/login`** - Ottieni JWT token

> Endpoint legacy mantenuto per test/sviluppo.

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"EpilepSy2025!Secure"}'
```

Risposta:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "expires_in": 86400,
  "username": "admin"
}
```

**GET `/health`** - Health check

```bash
curl http://localhost:8000/health
```

#### 🔒 Protetti (richiedono token)

**POST `/api/predict`** - Calcola rischio crisi

```bash
curl -X POST http://localhost:8000/api/predict \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "hrv": 50.5,
    "heart_rate": 75,
    "movement": 120,
    "sleep_hours": 7.5,
    "medication_taken": true
  }'
```

Risposta:
```json
{
  "risk_score": 0.245,
  "risk_level": "low",
  "message": "Rischio basso: tutto stabile.",
  "timestamp": "2025-12-05T16:30:00"
}
```

**GET `/api/test`** - Test con dati esempio

```bash
curl http://localhost:8000/api/test \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 📊 Parametri Fisiologici

| Parametro | Range | Descrizione | Ottimale |
|-----------|-------|-------------|----------|
| **HRV** | 0-200 ms | Heart Rate Variability | 50-100 |
| **Heart Rate** | 30-220 bpm | Battito cardiaco | 60-85 |
| **Movement** | 0+ | Livello attività | 80-180 |
| **Sleep Hours** | 0-24 h | Ore sonno (24h) | 7-9 |
| **Medication** | true/false | Farmaci assunti | true |
| **SpO₂** | 50-100 % | Saturazione ossigeno | 95-100 |
| **Respiratory Rate** | 1-80 rpm | Frequenza respiratoria | 12-20 |
| **Skin Temperature** | 30-45 °C | Temperatura cutanea | 35-37.5 |
| **Steps** | 0+ | Passi giornalieri | variabile |
| **Stress Index** | 0-1 | Stress normalizzato | < 0.4 |
| **Calories Burned** | 0+ kcal | Calorie consumate | variabile |
| **Fall Detected** | true/false | Evento caduta | false |

## 🎨 Livelli di Rischio

| Livello | Score | Colore | Messaggio |
|---------|-------|--------|-----------|
| **Low** | 0.00-0.33 | 🟢 Verde | Rischio basso: tutto stabile |
| **Medium** | 0.34-0.66 | 🟡 Giallo | Rischio moderato: tieni monitorato |
| **High** | 0.67-1.00 | 🔴 Rosso | Rischio elevato: segui il piano di sicurezza |

## 🔐 Sicurezza

### Credenziali di default

⚠️ **IMPORTANTE**: Cambia username e password in produzione!

- Username: `admin`
- Password: `EpilepSy2025!Secure`

### Best Practices Produzione

1. **Cambia SECRET_KEY** in `.env` con stringa random lunga (min 32 caratteri)
2. **Usa HTTPS** - mai HTTP in produzione
3. **Limita CORS** - cambia `allow_origins=["*"]` con domini specifici
4. **Password forte** - almeno 12 caratteri, maiuscole, numeri, simboli
5. **Backup .env** - mai committare su repository pubblici (già in .gitignore)
6. **Rate limiting** - implementa limitazione richieste per IP
7. **Monitoring** - attiva logging e monitoraggio accessi

### Genera nuova SECRET_KEY

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

## 📁 Struttura Progetto

```
epilepsy-wearable-seizure/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app principale
│   ├── models.py        # Modelli Pydantic
│   ├── auth.py          # Autenticazione JWT
│   ├── predictor.py     # Logica predizione
│   └── config.py        # Configurazione
├── frontend/
│   ├── index.html       # UI web
│   ├── style.css        # Stili
│   └── app.js           # Logica frontend
├── .env.example         # Template configurazione
├── .gitignore
├── requirements.txt
├── LICENSE
└── README.md
```

## 🧪 Testing

### Test Manuale

1. Vai su: http://localhost:8000/docs (Swagger UI)
2. Clicca su `/auth/login` → "Try it out"
3. Inserisci credenziali e ottieni token
4. Clicca su 🔒 "Authorize" in alto e incolla il token
5. Testa `/api/predict` con dati di esempio

### Test Automatico

```bash
# Test health check
curl http://localhost:8000/health

# Test login
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"EpilepSy2025!Secure"}' \
  | python -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

# Test predizione
curl -X POST http://localhost:8000/api/predict \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hrv":45,"heart_rate":80,"movement":100,"sleep_hours":6,"medication_taken":true}'
```

## 🐛 Troubleshooting

### Errore "Password hash non configurato"

Assicurati di aver:
1. Creato il file `.env`
2. Generato l'hash della password
3. Inserito `ADMIN_PASSWORD_HASH=...` nel .env

### Errore 401 "Credenziali non valide"

- Verifica username e password corretti
- Controlla che l'hash nel .env corrisponda alla password
- Il token JWT potrebbe essere scaduto (ri-logga)

### Frontend non si carica

- Verifica che la directory `frontend/` esista
- Controlla i permessi dei file
- Usa percorso completo: `http://localhost:8000/static/index.html`

### CORS Error

- Verifica che il backend sia su http://localhost:8000
- In produzione, aggiorna `cors_origins` in `app/config.py`

## 📝 TODO Futuri

- [ ] Database per storico predizioni
- [ ] Multi-utente con registrazione
- [ ] Grafici storici rischio
- [ ] Notifiche push per rischio alto
- [ ] Integrazione API smartwatch reali
- [ ] App mobile (React Native / Flutter)
- [ ] Machine Learning con dati reali
- [ ] Rate limiting per API
- [ ] Docker container
- [ ] CI/CD pipeline

## 📄 Licenza

Vedi file [LICENSE](LICENSE)

## 👤 Autore

**gcasaldi**

## ⚠️ Disclaimer

Questo sistema è un prototipo educativo. NON sostituisce consulenza medica professionale. Per diagnosi e trattamento rivolgersi sempre a personale sanitario qualificato.
