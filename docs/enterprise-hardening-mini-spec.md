# Enterprise Hardening Mini-Spec (multi-istanza)

Obiettivo: portare la piattaforma a un profilo security-first enterprise per uso con enti ospedalieri/privati, mantenendo il principio “paziente proprietario dei dati, ente solo con consenso attivo”.

## 1) Decisioni architetturali bloccate

### 1.1 Fail-open / fail-closed
- AuthN/AuthZ non disponibili (IdP/Policy/Redis): `fail-closed`.
- Endpoint clinici e export: `fail-closed`.
- Feature non sensibili (es. health check): `fail-open` controllato.
- In caso degrado: modalità read-only locale solo per utente già autenticato, senza accesso B2B.

Endpoint consentiti in graceful mode (`personal-only read`):
- `GET /health`
- `GET /api/me` (utente già autenticato)
- endpoint personali read-only non B2B (es. timeline personale senza export)

Endpoint negati in graceful mode:
- tutte le API B2B (`org/*`, dashboard multi-paziente)
- export
- change-role/membership

### 1.2 Token & sessioni
- Access token breve (5–15 min).
- Refresh token con rotation one-time e detection reuse.
- JWT con `jti`, `sub`, `org_id` (se contesto ente), `role`, `consent_version`, `token_version`.
- Revoca centralizzata: Redis blacklist su `jti` + versione sessione utente su DB.
- Logout globale: incrementa `token_version` + revoca refresh token attivi.
- Step-up auth obbligatorio per `export` e `change-role`.

### 1.3 Multi-tenancy
- Isolamento hard a livello DB (Postgres RLS) su risorse B2B.
- Ogni query clinica include `org_id` + verifica consenso attivo.
- Test automatici tenant-escape obbligatori in CI.

## 2) Componenti sicurezza (target)

- IdP: Google OIDC (oggi) + opzionale SSO enterprise futuro.
- API Gateway/WAF: rate limit, abuse detection, IP reputation.
- App API: policy engine unico RBAC+ABAC.
- Postgres: RLS, audit append-only, cifratura a riposo.
- Redis (HA): revocation store, anti-replay, rate limiting distribuito.
- KMS/Vault: gestione segreti e chiavi (rotation periodica).
- SIEM: centralizzazione log, alerting, correlazione eventi.

## 3) Modello dati e vincoli (robustezza)

- `patients.owner_user_id` unique (default: 1 profilo paziente per user).
- `caregiver_links` unique (`patient_id`, `caregiver_user_id`) + vincolo `no self-link`.
- `patient_org_consents`: consenso attivo unico per (`patient_id`, `org_id`) via unique parziale su `status='active'`.
- Race condition consenso: creazione consenso in transazione con lock (es. `SELECT ... FOR UPDATE` su coppia paziente/ente).

Indici obbligatori:
- `patient_org_consents(patient_id, org_id, status)`
- `org_memberships(org_id, user_id, status)`
- `seizure_events(patient_id, event_time DESC)`
- `audit_log(org_id, created_at DESC)`
- `audit_log(actor_user_id, created_at DESC)`

Domini enti:
- `organizations.domain` normalizzato lowercase.
- validazione formato + difese anti-spoof/typosquatting.
- supporto domini multipli: tabella `organization_domains(org_id, domain, verified)`.

## 4) Policy unificata (RBAC + ABAC + consenso)

Accesso a dato clinico consentito solo se tutte vere:
1. Utente autenticato e sessione valida.
2. Utente attivo, non cancellato.
3. Ente `verified`.
4. Membership attiva con ruolo adeguato.
5. Consenso paziente→ente `active`.
6. `scope` consenso include la risorsa richiesta.
7. Azione conforme al principio least-privilege.

Regola pratica:
- `ALLOW = role_permission AND org_verified AND active_membership AND active_consent(scope)`
- Se una condizione manca: deny + audit.

Consenso e scopi:
- separazione purpose: `care | research | operations` (campi distinti o `purpose` su consenso).
- `scope` JSON in MVP con `scope_schema_version` obbligatorio per compatibilità evolutiva.

## 5) Redis revocation store (specifica minima)

### 4.1 Key schema
- `revoked:jti:{jti}` -> value `1`, TTL = exp token.
- `refresh:family:{family_id}` -> stato rotazione.
- `session:user:{user_id}:token_version` -> int cache/guard.

Tabella DB minima per refresh token:
- `refresh_tokens(id, user_id, family_id, token_hash, issued_at, expires_at, revoked_at, replaced_by, ip, device)`

### 4.2 Affidabilità
- Redis Sentinel/Cluster con replica.
- Persistence: AOF + snapshot RDB.
- Timeout e retry brevi; circuit breaker lato API.

### 4.3 Comportamento in fault
- Endpoint sensibili: deny (`fail-closed`).
- Endpoint non sensibili: degradazione controllata.
- Evento sicurezza in SIEM su ogni fallback.

## 6) Cifratura & segreti

- TLS 1.2+ ovunque (client↔API↔DB/Redis interni).
- Encryption at rest su DB/volume backup.
- Field-level encryption per PHI ad alta sensibilità (chiavi KMS).
- Secrets fuori da repo/env statici: Vault/KMS + rotation + access policy.

## 7) Audit immutabile

- Tabella append-only + hash chain (`hash_prev`, `hash_this`) o storage WORM.
- Eventi obbligatori: login, recovery, cambio ruolo, consenso grant/revoke, export, accesso dato clinico.
- Retention definita e verificabile; query forense pronta.
- Enforcement append-only a livello DB: trigger che blocca `UPDATE/DELETE` su `audit_log`.
- `meta` audit senza PHI diretta (o PHI minimizzata/pseudonimizzata).

## 8) Recovery & MFA

- Recovery solo tramite identità verificata (OIDC/email verificata).
- Token recovery short-lived, single-use.
- Invalida tutte le sessioni dopo recovery.
- Step-up MFA obbligatorio per ruoli admin ente e azioni ad alto rischio (export, role changes, integration keys).

## 9) Data lifecycle

- Soft delete account con revoca automatica consensi/link.
- Pseudonimizzazione per obblighi legali/audit.
- Retention policy per evento dato (clinico, audit, export).
- Legal hold supportato quando richiesto.
- Stato paziente: `patients.status` + `archived_at` per lifecycle coerente dopo cancellazione user.
- Retention esplicitata per categoria dato (anche inizialmente `TBD` con owner e data revisione).

## 10) Inviti / QR / codici (anti-abuso)

Guardrail obbligatori:
- rate limit per `org_id` e per `created_by_user_id`
- `max_uses` (default 1 per invito personale)
- `code_hash` + pepper server-side
- audit eventi invito: generated/viewed/used/failed/revoked
- linking confirmation lato paziente con nome ente + policy prima dell’accettazione

## 11) Note cliniche & responsabilità

Tabella minima:
- `clinical_notes(id, patient_id, org_id, author_user_id, note, visibility, created_at, updated_at)`

Vincolo medico-legale:
- note append-only o versionate (no overwrite distruttivo)

## 12) Export controllato

Guardrail obbligatori:
- watermarking + `export_id`
- motivo export obbligatorio
- rate limit export
- scope `minimum necessary`
- audit obbligatorio + alert su pattern anomali

## 13) Provider verification workflow

- supportare re-apply flow: `pending -> rejected -> pending`
- verifica dominio + autorizzazione effettiva del richiedente
- difese anti-impersonation (domini simili/typosquatting)

## 14) Minimizzazione dati

- campi sensibili opzionali solo con motivazione esplicita
- evitare in MVP dati non necessari (indirizzo, CF, telefono paziente, ecc.)

## 15) CI/CD & vulnerabilità

- SAST + dependency scanning + SBOM a ogni PR.
- DAST periodico su stage.
- Migrazioni Alembic zero-downtime: expand/contract, rollback plan, feature flags, canary.
- Security gates bloccanti su severity alta/critica.

## 16) Operatività enterprise

- RPO target iniziale: <= 15 minuti
- RTO target iniziale: <= 60 minuti
- backup cifrati + restore drill periodico obbligatorio

## 17) Security test checklist (must-pass)

1. Tenant escape test (query cross-org negate).
2. RBAC bypass test (readonly non esporta).
3. Consenso revoca immediata (accesso negato istantaneo).
4. Token replay test (`jti` revocato).
5. Refresh token reuse detection.
6. Recovery fraud scenario (alert + lock temporaneo).
7. Export abuse (rate limit + audit watermark).
8. Redis down scenario (fail-closed su endpoint sensibili).
9. Backup restore drill (RPO/RTO target rispettati).
10. Audit tamper check (hash chain consistente).
11. Invite abuse test (max_uses, brute force codici, replay).
12. Step-up bypass test (export/change-role negati senza MFA).

---

## Deliverable immediati consigliati (ordine)

1. Policy engine unico (middleware/dependency centralizzata).
2. Alembic baseline + migrazioni versionate.
3. Redis revocation/rate-limit distribuito.
4. RLS Postgres su risorse B2B.
5. SIEM + alerting sicurezza.

Priorità alta immediata:
1. `clinical_notes` + audit append-only con blocco `UPDATE/DELETE`.
2. Refresh token store + step-up MFA per `export` / `change-role`.
3. Hardening inviti (`max_uses`, pepper, rate limit, audit eventi invito).
