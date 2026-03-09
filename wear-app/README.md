# Epilepsy Wear OS App

App nativa Android per smartwatch Wear OS che monitora parametri fisiologici, prevede il rischio di crisi e invia telemetria/alert al telefono associato.

## 🎯 Funzionalità

- ✅ Lettura sensori in tempo reale (HRV, battito cardiaco)
- ✅ Telemetria estesa (SpO₂, respirazione, temperatura, passi, stress, calorie, caduta)
- ✅ Login automatico con credenziali salvate
- ✅ Invio dati al backend FastAPI
- ✅ Invio dati watch → telefono con Wearable Data Layer
- ✅ Visualizzazione rischio con colori (verde/giallo/rosso)
- ✅ UI ottimizzata per schermi circolari
- ✅ Monitoraggio continuo in background
- ✅ Alert vibrante su watch + messaggio alert verso telefono
- ✅ Campionamento/valutazione autonoma ogni 5 minuti direttamente da watch app

## 📋 Prerequisiti

- Android Studio (latest version)
- Smartwatch Wear OS 3.0+ o emulatore
- Backend FastAPI in esecuzione

## 🚀 Setup

### 1. Apri il progetto

```bash
# Apri Android Studio
# File → Open → Seleziona la directory 'wear-app'
```

### 2. Configura l'indirizzo del server

Il client Wear legge `API_BASE_URL` da Gradle (default: `http://10.0.2.2:8000/`).

Esempio build con server LAN:

```bash
./gradlew :app:assembleDebug -PAPI_BASE_URL=http://192.168.1.100:8000/
```

**Se testi con emulatore:** `http://10.0.2.2:8000/`
**Se testi con watch fisico:** IP LAN della macchina (es. `http://192.168.1.100:8000/`)

### 3. Sincronizza Gradle

Android Studio sincronizzerà automaticamente le dipendenze.

### 4. Connetti il dispositivo

**Emulatore:**
- Tools → Device Manager → Create Virtual Device → Wear OS

**Smartwatch fisico:**
- Attiva "Developer options" sul watch
- Attiva "ADB debugging"
- Connetti via WiFi/USB

### 5. Run

Clicca sul pulsante ▶️ Run in Android Studio

## 📱 Utilizzo

1. **Primo avvio**: L'app richiede il login
2. **Login automatico**: Credenziali salvate (admin / EpilepSy2025!Secure)
3. **Start Monitoring**: Avvia la lettura sensori
4. **Visualizzazione rischio**: Aggiornamento continuo in UI + ciclo autonomo ogni 5 minuti in foreground service
5. **Stop**: Ferma il monitoraggio

### Modalita autonoma (senza PC/web aperto)

- Quando premi `START MONITOR`, il watch avvia `MonitoringService` in foreground.
- Il servizio resta attivo in background e ogni 5 minuti:
	- legge lo snapshot sensori disponibile,
	- calcola/recupera rischio,
	- invia telemetria al telefono (Data Layer),
	- genera alert locale su watch per rischio alto o stato di tensione (HR alto + HRV bassa).
- Se il watch viene riavviato, il servizio riparte automaticamente se era attivo prima del reboot.

## 🔧 Troubleshooting

### APK locale per installazione rapida

Dopo una build (`assembleDebug` o `assembleRelease`) il backend espone automaticamente l'APK su:

```text
http://<host>:8000/app/apk
```

La pagina web `http://<host>:8000/app` mostra pulsante **Scarica APK locale** + QR dedicato.

### "Cannot resolve symbol" errors
```bash
# In Android Studio:
File → Invalidate Caches → Invalidate and Restart
```

### Errore connessione API
- Verifica che il backend sia in esecuzione
- Controlla l'indirizzo IP in `ApiClient.kt`
- Verifica firewall/network

### Sensori non funzionano
- Controlla permessi in Settings → Apps → Epilepsy Monitor
- Alcuni emulatori non supportano Health Services

## 📝 Note Importanti

⚠️ **Simulazione sensori**: Il codice attuale simula i dati dei sensori per testing. Per produzione:
1. Implementa `PassiveListenerService` completo
2. Richiedi permessi runtime
3. Gestisci casi in cui Health Services non è disponibile

⚠️ **Alert sul telefono**: l'app watch invia messaggi Data Layer con path:
- `/epilepsy/telemetry`
- `/epilepsy/alert`

Per notifiche visibili sul telefono serve una companion app Android che ascolti questi path e mostri la notifica locale.

⚠️ **Credenziali**: Cambia username/password hardcoded in produzione

⚠️ **Background monitoring**: Richiede ottimizzazione batteria

## 🔐 Permessi richiesti

- `BODY_SENSORS` - Lettura frequenza cardiaca
- `ACTIVITY_RECOGNITION` - Rilevamento movimento
- `INTERNET` - Comunicazione con backend
- `health.READ_HEART_RATE` - Health Connect
- `health.READ_SLEEP` - Dati sonno
- `health.READ_STEPS` - Passi/movimento

## 📚 Risorse

- [Wear OS Documentation](https://developer.android.com/training/wearables)
- [Health Services API](https://developer.android.com/training/wearables/health-services)
- [Compose for Wear OS](https://developer.android.com/training/wearables/compose)
