# Epiguard Platform 🧠 SY-45

Epiguard è una piattaforma digitale futuristica per il monitoraggio e la prevenzione delle crisi epilettiche tramite wearable e intelligenza artificiale.

## 🚀 Ambiente Demo (Come Funziona)

Per visualizzare la demo completa della piattaforma e testare tutte le funzionalità:

1.  **Avvia il Backend**:
    ```bash
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8010
    ```
2.  **Accedi al Terminale**: [http://localhost:8010/login](http://localhost:8010/login)
3.  **Credenziali Demo**: `admin` / `password`
4.  **Test Reale (Giulia)**: `giulia.casaldi@gmail.com` / `GiuliaEpi2026!`

---

## 📱 Google Play Store Roadmap

Per pubblicare Epiguard sul Play Store, seguiremo questi step tecnici:

1.  **Build Release**: Generazione del file `.aab` tramite il comando `./gradlew bundleRelease`.
2.  **Signing**: Firma dell'app con una chiave di produzione protetta.
3.  **Compliance Sanitaria**: Dichiarazione dei permessi per Health Connect e sensori biometrici.
4.  **Privacy Policy**: Pubblicazione della policy sulla protezione dei dati sensibili (GDPR/HIPAA).

---

## 🛠️ Istruzioni per lo Sviluppo

**Accesso da Smartphone:**
Assicurati che il telefono sia sulla stessa rete WiFi del PC. Trova l'IP locale (es. `192.168.1.XX`) e accedi via: `http://192.168.1.XX:8010/login`
