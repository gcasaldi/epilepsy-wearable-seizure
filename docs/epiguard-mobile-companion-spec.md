# Epiguard Mobile Companion Spec (Android)

Obiettivo: app operativa, leggera e nativa. Non una web app duplicata.

## 1) Sezioni UX obbligatorie

## Home
- rischio attuale (`LOW | MEDIUM | HIGH`)
- stato sync
- ultimo valore battito/HRV disponibile
- timestamp ultimo aggiornamento
- azione rapida `Sincronizza`

## Dati
- sensori collegati
- permessi attivi Health Connect
- qualita dati (copertura, latenza, missing)
- cronologia sync

## Diario
- aura percepita
- sintomi
- sonno percepito
- farmaco preso/saltato
- eventuale crisi

## Alert
- notifiche rischio
- promemoria terapia
- contatti emergenza

## Profilo
- account
- privacy
- consensi
- logout

## 2) Home layout minimo

```text
[ Epiguard ]
Buongiorno <Nome>

[ Risk Score ]
LOW / MEDIUM / HIGH

[ Ultimo sync ]
10 min fa

[ Segnali ]
HR | HRV | Sonno | Movimento

[ Azioni rapide ]
Sincronizza | Registra aura | Farmaco preso | Contatta emergenza
```

## 3) Requisiti non funzionali mobile

- UI con poche informazioni per schermata.
- Card grandi, tipografia leggibile, contrasto elevato.
- Latenza percepita ridotta con stato sync esplicito.
- Coda locale robusta (retry con backoff esponenziale).
- Deduplica client-side prima dell'upload.

## 4) Sync policy

- Trigger manuale: bottone `Sincronizza`.
- Trigger automatico: intervallo periodico + eventi Health Connect.
- Ogni payload deve includere:
  - `device_id`
  - `source`
  - `metric`
  - `timestamp`
  - `value`
  - `unit`
  - `idempotency_key`

## 5) Anti-pattern esplicitamente vietati

- app pesante con molte schermate ridondanti
- seconda web app in wrapper senza funzionalita native reali
- stato locale non allineato al backend
- logica AI eseguita esclusivamente client-side
