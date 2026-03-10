# Epiguard Core Architecture (Single System)

Questo documento formalizza la visione target: Epiguard e un unico sistema composto da tre blocchi coordinati.

## 1) Componenti principali

## Web App (Control Center)
- dashboard principale
- storico clinico e timeline
- report ed export
- gestione consensi
- configurazioni account/organizzazione
- pannello medico/paziente

## Mobile App (Companion)
- login utente
- connessione sensori e Health Connect
- raccolta dati in foreground/background
- notifiche e stato rapido
- invio dati al backend

## Backend/API (Single Source of Truth)
- autenticazione/autorizzazione
- ingest dati mobile
- persistenza unificata
- orchestrazione feature pipeline e risk scoring AI
- esposizione dati consistenti a web e mobile

## 2) Principio non negoziabile

Web e mobile non comunicano mai direttamente tra loro.
Entrambe parlano solo con la stessa API centrale.

## 3) Flusso tecnico ufficiale

```text
[ Wearable / Health Connect ]
            |
            v
      [ Mobile App ]
            |
            v
      [ Epiguard API ]
         /         \
        v           v
 [ Database ]   [ AI Risk Engine ]
         \         /
          v       v
     [ Web App ] [ Mobile App ]
```

## 4) Flusso operativo end-to-end

1. Utente apre la mobile app.
2. Mobile acquisisce dati consentiti da Health Connect.
3. Mobile invia record all'API (`/health/sync`).
4. Backend normalizza, deduplica e salva su storage raw.
5. Feature pipeline aggiorna baseline e segnali temporali.
6. Risk engine calcola score su finestre 2h/6h/24h.
7. Web e mobile leggono lo stesso stato aggiornato.

## 5) Vincoli architetturali

- Niente database separato mobile come fonte primaria.
- Niente salvataggio locale definitivo non sincronizzato.
- Niente logica di rischio duplicata nel client.
- Backend unico per coerenza semantica di score, eventi e consensi.

## 6) Naming componenti (repo-level)

- `epiguard-web`: interfaccia analitica e gestione.
- `epiguard-android-companion`: raccolta, sync, diario, alert.
- `epiguard-api`: API gateway applicativo e servizi core.
- `epiguard-feature-pipeline`: normalizzazione e feature engineering.
- `epiguard-risk-engine`: score e spiegazioni modello.
- `epiguard-consent-service`: policy e lifecycle consensi.
