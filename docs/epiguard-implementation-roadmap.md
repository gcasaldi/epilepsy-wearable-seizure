# Epiguard Implementation Roadmap (MVP)

Obiettivo: realizzare un sistema unico con backend centrale, mobile companion operativa e web control center.

## Sprint 0 (Setup, 1 settimana)

Deliverable:
- baseline API FastAPI con auth JWT
- ambienti `dev/stage` e database Postgres
- tabella `device_registry` e health endpoint

Done criteria:
- login funzionante
- token validato su endpoint protetto
- migrazioni DB versionate

## Sprint 1 (Data Ingestion, 1-2 settimane)

Deliverable:
- endpoint `POST /health/sync`
- deduplica via `idempotency_key`
- validazione payload metriche MVP (HR, HRV, sleep, activity)
- persistenza in `raw_health_data`

Done criteria:
- ingest idempotente verificato con test
- tracciamento quality flag e request id

## Sprint 2 (Mobile Companion Core, 2 settimane)

Deliverable:
- login mobile
- integrazione Health Connect
- schermate Home e Dati
- sync manuale + cronologia sync

Done criteria:
- almeno 1 ciclo completo: acquisizione -> upload -> conferma backend
- error handling con retry e backoff

## Sprint 3 (Diary + Eventi umani, 1 settimana)

Deliverable:
- endpoint `POST /journal/event`
- schermata Diario con input rapido
- storage su tabella `events`

Done criteria:
- registrazione aura/sintomi/farmaco in meno di 2 tap
- evento visibile in timeline web

## Sprint 4 (Risk Engine MVP, 2 settimane)

Deliverable:
- pipeline feature minima (baseline + delta)
- calcolo score `LOW/MEDIUM/HIGH` su orizzonte 2h
- endpoint `GET /risk/current` e `GET /risk/history`

Done criteria:
- score aggiornato dopo sync
- fattori esplicativi minimi nel payload (`factors`)

## Sprint 5 (Web Control Center, 2 settimane)

Deliverable:
- dashboard overview (`GET /dashboard`)
- trend 7 giorni e timeline segnali
- pagina consensi e report base

Done criteria:
- web e mobile leggono lo stesso stato rischio
- nessuna dipendenza diretta web<->mobile

## Sprint 6 (Hardening, 1 settimana)

Deliverable:
- audit eventi sensibili
- rate limit endpoint critici
- monitoraggio freshness dati e job score

Done criteria:
- KPI minimi tracciati in dashboard tecnica
- test regressione API passati

## KPI MVP

- freshness ingest p95 < 10 minuti
- tempo ingest->score < 2 minuti
- copertura giorni con dati completi > 80%
- utilizzo diario umano > 40% utenti attivi

## Rischi principali e mitigazioni

- Dati sporchi da sorgenti wearable:
  - mitigazione: normalizzazione e quality flag in ingest.
- Bassa adozione input manuale:
  - mitigazione: quick actions in home mobile.
- Incoerenza tra client:
  - mitigazione: backend unica fonte, contratti API condivisi.
