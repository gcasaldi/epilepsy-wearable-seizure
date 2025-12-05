# Epilepsy Wear OS App

App nativa Android per smartwatch Wear OS che monitora parametri fisiologici e prevede il rischio di crisi epilettiche.

## 🎯 Funzionalità

- ✅ Lettura sensori in tempo reale (HRV, battito cardiaco)
- ✅ Login automatico con credenziali salvate
- ✅ Invio dati al backend FastAPI
- ✅ Visualizzazione rischio con colori (verde/giallo/rosso)
- ✅ UI ottimizzata per schermi circolari
- ✅ Monitoraggio continuo in background
- ✅ Alert vibrante per rischio alto

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

Modifica `ApiClient.kt` (linea 52):

```kotlin
private val BASE_URL = "http://YOUR_SERVER_IP:8000/"
```

**Se testi con emulatore:** usa `http://10.0.2.2:8000/`
**Se testi con watch fisico:** usa l'IP della tua macchina (es. `http://192.168.1.100:8000/`)

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
4. **Visualizzazione rischio**: Aggiornamento continuo ogni 5 secondi
5. **Stop**: Ferma il monitoraggio

## 🔧 Troubleshooting

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
