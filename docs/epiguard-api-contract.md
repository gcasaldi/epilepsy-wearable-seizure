# Epiguard Unified API Contract (Web + Mobile)

Questo contratto fissa il principio: web e mobile usano la stessa API centrale.

## 1) Autenticazione

- JWT access token breve durata
- refresh token con rotation
- header richiesto: `Authorization: Bearer <token>`

## 2) Endpoint mobile (operativi)

## `POST /auth/login`
Scopo: autenticazione utente.

Request:
```json
{
  "email": "user@example.com",
  "password": "***"
}
```

Response:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "bearer",
  "expires_in": 900
}
```

## `POST /health/sync`
Scopo: ingest dati biometrici da mobile companion.

Request:
```json
{
  "device_id": "android-uuid",
  "provider": "health_connect",
  "records": [
    {
      "idempotency_key": "u1_hr_2026-03-10T08:30:00Z",
      "metric": "heart_rate",
      "value": 78.0,
      "unit": "bpm",
      "timestamp": "2026-03-10T08:30:00Z",
      "source": "pixel_watch"
    },
    {
      "idempotency_key": "u1_hrv_2026-03-10T08:30:00Z",
      "metric": "hrv_rmssd",
      "value": 41.3,
      "unit": "ms",
      "timestamp": "2026-03-10T08:30:00Z",
      "source": "pixel_watch"
    }
  ]
}
```

Response:
```json
{
  "accepted": 2,
  "deduplicated": 0,
  "rejected": 0,
  "sync_id": "c2e6f23f-7da0-4d9a-bf1e-112233445566"
}
```

## `POST /journal/event`
Scopo: input umano rapido (aura/sintomi/terapia).

Request:
```json
{
  "event_type": "aura",
  "severity": "medium",
  "notes": "sensazione pre-crisi",
  "occurred_at": "2026-03-10T09:10:00Z"
}
```

Response:
```json
{
  "event_id": "3d0e9e42-9d26-4a95-9adf-123456789abc",
  "status": "stored"
}
```

## `GET /risk/current`
Scopo: rischio corrente per home mobile.

Response:
```json
{
  "level": "MEDIUM",
  "score": 0.67,
  "window": "2h",
  "factors": [
    "hrv_bassa_vs_baseline",
    "sonno_ridotto_24h"
  ],
  "updated_at": "2026-03-10T09:12:00Z"
}
```

## `GET /profile`
Scopo: dati profilo/account/consensi rapidi.

## 3) Endpoint web (analitici)

## `GET /dashboard`
- overview KPI giornalieri
- rischio corrente e indicatori qualita dati

## `GET /risk/history?window=7d`
- storico score e livelli di rischio

## `GET /health/timeline?from=...&to=...`
- serie temporali segnali biometrici

## `GET /reports?type=clinical_summary`
- lista report generati/esportabili

## `GET /consents`
- stato e storico consensi attivi/revocati

## 4) Convenzioni API

- Tutti i timestamp in ISO-8601 UTC.
- Idempotenza obbligatoria su ingest mobile.
- Error envelope standard:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "metric non supportata",
    "details": []
  }
}
```

- Correlation id per tracing: header `X-Request-Id`.
- Audit obbligatorio per azioni sensibili (consensi, export, accessi clinici).
