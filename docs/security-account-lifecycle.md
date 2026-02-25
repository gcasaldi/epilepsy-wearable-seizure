# Gestione utenza, recupero e sicurezza

Questa specifica definisce i requisiti operativi per una piattaforma sanitaria ad alta criticità, con collaborazione verso enti ospedalieri pubblici o privati.

## 1) Cancellazione account (diritto dell’utente)

Ogni utente (`patient` o `caregiver`) può richiedere la cancellazione account in qualsiasi momento dalle impostazioni.

Effetti immediati obbligatori:
- disattivazione immediata accesso
- revoca automatica di tutti i consensi attivi verso enti
- rimozione da collegamenti caregiver/paziente
- blocco definitivo dell’autenticazione

Gestione dati clinici post-cancellazione:
- non più accessibili a enti
- archiviati o pseudonimizzati per obblighi legali/audit
- non riutilizzabili per nuove elaborazioni cliniche o di prodotto

Implementazione richiesta:
- `soft delete` con timestamp (`deleted_at`) e motivo
- audit immutabile dell’evento di cancellazione

## 2) Gestione account ente sanitario

Utenti di un ente possono:
- uscire in autonomia dall’organizzazione
- essere rimossi da un admin

Vincolo di continuità amministrativa:
- un admin può cancellare il proprio account solo se nell’ente resta almeno un altro admin attivo

Nota contrattuale:
- l’organizzazione (`organization`) non viene cancellata automaticamente con la cancellazione di un membro

## 3) Account recovery (sicuro + antifrode)

Requisiti:
- recupero accesso solo via provider autenticati (Google OIDC) o email verificata
- token temporanei a breve scadenza
- invalidazione di tutte le sessioni attive dopo recovery
- notifica utente su tentativo e successo recovery

Per account privilegiati (`provider admin`):
- step addizionale di verifica
- revisione manuale in caso di anomalia

Divieto esplicito:
- nessun flusso di recovery può bypassare un’identità verificata

## 4) Sicurezza avanzata (principi)

La piattaforma adotta modello `security-first`:
- autenticazione forte (OIDC; MFA consigliato per enti)
- RBAC rigoroso con least privilege
- tenant isolation totale per ente
- consenso esplicito/versionato/revocabile
- audit log immutabile su accessi, consensi, ruoli, export
- sessioni a durata limitata + rotazione token
- protezioni anti-abuso e anti-escalation ruoli

Ogni accesso a dati sanitari deve essere:
- tracciato
- autorizzato dal ruolo
- verificato rispetto a consenso attivo e scope

## 5) Checklist tecnica minima da rendere obbligatoria

- TLS obbligatorio in produzione
- CORS restrittivo (no wildcard)
- trusted hosts attivi
- rate limit su endpoint autenticazione
- header di sicurezza HTTP
- secret rotation periodica
- logging strutturato + allerta su eventi sensibili
- backup cifrati + test periodico restore

## 6) Controlli compliance (operativi)

- DPIA iniziale e revisione periodica
- registro trattamenti aggiornato
- policy retention dati e minimizzazione
- procedura DSAR (accesso/cancellazione/rettifica)
- accordi DPA con fornitori cloud/servizi

## 7) Stato implementazione attuale

Già introdotto nel backend corrente:
- login Google + JWT applicativo
- provisioning persistente utente su login
- CORS restrittivo configurabile
- trusted hosts configurabili
- rate limiting in-memory su endpoint auth
- security headers base su risposte auth/api
- endpoint `DELETE /api/account` con soft delete + revoca consensi/link caregiver
- invalidazione sessione via `token_version` nel JWT

Da completare nel prossimo step:
- persistenza DB per soft delete/consensi/versioning
- invalidazione centralizzata sessioni (revocation list / session store)
- audit append-only persistente
- RBAC + tenant isolation su tabelle cliniche con RLS
