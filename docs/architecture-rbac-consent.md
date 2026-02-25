# Architettura unica: identità personali + sanitarie

Questo documento definisce lo schema tecnico pronto-sviluppo per una sola piattaforma epilessia con due identità distinte:

- **Personal**: paziente/caregiver (uso personale, accesso immediato)
- **Provider**: ente sanitario (funzioni B2B solo dopo verifica)

## 1) Stati account

### `users`
- `account_type`: `personal | provider`
- `provider_status` (solo se `provider`): `provider_pending | provider_verified | provider_rejected`

Regola applicativa:
- Se `provider_status != provider_verified`, tutte le funzionalità B2B sono disabilitate.

## 2) Modello dati (MVP estensibile)

## Core identity

### `users`
- `id` (uuid, PK)
- `email` (unique, not null)
- `auth_provider` (es. `google`)
- `account_type` (`personal|provider`)
- `provider_status` (nullable)
- `created_at`, `updated_at`

### `organizations`
- `id` (uuid, PK)
- `legal_name`
- `vat_or_tax_code`
- `domain`
- `status` (`pending|verified|rejected`)
- `created_by_user_id` (FK `users.id`)
- `verified_at` (nullable)
- `rejected_reason` (nullable)
- `created_at`, `updated_at`

### `org_memberships`
- `id` (uuid, PK)
- `org_id` (FK `organizations.id`)
- `user_id` (FK `users.id`)
- `role` (`admin|clinician|operator|readonly`)
- `status` (`active|invited|disabled`)
- `created_at`, `updated_at`

Vincoli consigliati:
- unique (`org_id`, `user_id`)

## Identità clinica paziente

### `patients`
- `id` (uuid, PK)
- `owner_user_id` (FK `users.id`)
- `display_name` (nullable)
- `dob_year` (nullable)
- `created_at`, `updated_at`

### `caregiver_links`
- `id` (uuid, PK)
- `patient_id` (FK `patients.id`)
- `caregiver_user_id` (FK `users.id`)
- `relationship` (nullable)
- `status` (`pending|active|revoked`)
- `created_at`, `updated_at`

## Consenso versionato (chiave legale/funzionale)

### `patient_org_consents`
- `id` (uuid, PK)
- `patient_id` (FK `patients.id`)
- `org_id` (FK `organizations.id`)
- `scope` (json)  
  Esempio:
  ```json
  {
    "seizure_events": true,
    "medications": true,
    "aggregated_reports": true,
    "export": false
  }
  ```
- `version` (int, incrementale su coppia patient+org)
- `status` (`active|revoked`)
- `granted_by_user_id` (FK `users.id`)
- `granted_at`
- `revoked_at` (nullable)
- `revoked_by_user_id` (nullable)

Vincoli consigliati:
- unique (`patient_id`, `org_id`, `version`)
- unique parziale per singolo consenso attivo: (`patient_id`, `org_id`) where `status = 'active'`

## Inviti / codice clinica / QR

### `org_patient_invites`
- `id` (uuid, PK)
- `org_id` (FK `organizations.id`)
- `invite_type` (`code|email|qr`)
- `code_hash` (nullable)
- `email_target` (nullable)
- `expires_at`
- `created_by_user_id` (FK `users.id`)
- `status` (`active|used|expired|revoked`)
- `used_by_patient_id` (nullable)
- `used_at` (nullable)
- `created_at`, `updated_at`

Regola:
- Quando invito diventa `used`, si crea nuovo record in `patient_org_consents` con `version = version + 1` e `status = active`.

## Dati clinici minimi (MVP)

### `seizure_events`
- `id` (uuid, PK)
- `patient_id` (FK `patients.id`)
- `event_time`
- `type`
- `severity` (nullable)
- `duration_seconds` (nullable)
- `notes` (nullable)
- `created_by_user_id` (FK `users.id`)
- `created_at`, `updated_at`

### `medications`
- `id` (uuid, PK)
- `patient_id` (FK `patients.id`)
- `drug_name`
- `dose`
- `schedule`
- `start_date`
- `end_date` (nullable)
- `created_by_user_id` (FK `users.id`)
- `created_at`, `updated_at`

## Audit log

### `audit_log`
- `id` (uuid, PK)
- `org_id` (nullable FK `organizations.id`)
- `actor_user_id` (FK `users.id`)
- `action` (es. `CONSENT_GRANTED`, `PATIENT_VIEWED`, `EXPORT`)
- `entity_type`
- `entity_id`
- `meta` (json)
- `created_at`
- `hash_prev` (nullable)
- `hash_this` (nullable)

Nota: `hash_prev/hash_this` abilita una chain append-only utile per audit avanzato.

## 3) RBAC ente

Ruoli:
- `admin`
- `clinician`
- `operator`
- `readonly`

Permessi MVP:
- `admin`: team/ruoli, inviti, export, report, settings ente
- `clinician`: lettura pazienti con consenso, note cliniche, report
- `operator`: operatività non clinica completa, lettura subset
- `readonly`: sola consultazione senza export/inviti

Regola globale:
- Nessuna action B2B se `organizations.status != verified`.

## 4) Tenant isolation (obbligatoria)

Un utente in contesto ente può accedere ai dati paziente **solo se tutte vere**:
1. `organizations.status = verified`
2. membership attiva in `org_memberships`
3. esiste consenso `patient_org_consents.status = active`
4. `scope` del consenso consente il tipo di dato richiesto

Implementazione consigliata:
- Postgres con RLS per tabelle B2B
- policy basate su `org_id`, membership e consenso attivo

## 5) Messaggistica e confini clinici

UI, ToS e privacy devono includere:
- supporto al monitoraggio e condivisione dati
- nessuna diagnosi automatica
- non sostituisce il parere medico
- alert/insight hanno finalità informativa

## 6) Flussi operativi

### A) Onboarding ente
1. Provider signup
2. `organizations.status = pending`
3. verifica manuale (email dominio + dati legali)
4. passaggio a `verified`
5. abilita dashboard B2B

### B) Collegamento paziente
1. ente genera invito (`code|email|qr`)
2. paziente accetta
3. crea nuovo consenso versionato `active`
4. ente visualizza paziente nei limiti dello scope

### C) Revoca
1. paziente/caregiver revoca consenso
2. consenso passa a `revoked`
3. accesso ente rimosso immediatamente
4. evento registrato in `audit_log`

## 7) Decisioni tecniche da bloccare subito

- DB: Postgres (consigliato) con migrazioni Alembic
- Auth: Google OIDC + JWT interno
- Soft delete: valutare solo su tabelle sensibili; preferire stato (`revoked|disabled`) in MVP
- Scope consenso: JSON in MVP, possibile normalizzazione successiva
- Multi-tenancy: colonna `org_id` su ogni risorsa B2B

## 8) Piano implementazione (ordine suggerito)

1. Migrazioni `users`, `organizations`, `org_memberships`
2. Migrazioni `patients`, `caregiver_links`
3. Migrazioni consenso/inviti (`patient_org_consents`, `org_patient_invites`)
4. Middleware autorizzazione + RBAC + consenso
5. Audit logging centralizzato
6. API onboarding ente + verifica manuale
7. API link paziente via codice/QR + revoca
8. Dashboard B2B multi-paziente

---

Sintesi prodotto:

> Il paziente usa la piattaforma per sé; l’ente, solo se verificato e con consenso esplicito, monitora in modo strutturato i propri pazienti in una dashboard clinica dedicata.
