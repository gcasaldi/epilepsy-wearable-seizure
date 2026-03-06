# Deploy web app su Firebase Hosting

Questa guida pubblica la parte web (`docs/`) su Firebase Hosting con deploy automatico da GitHub.

## 1) Prerequisiti

- Progetto Firebase creato (es. `epiguard-web-prod`)
- Repository GitHub con permessi per aggiungere Secrets
- Backend API gia online (es. Render/Railway), ad esempio `https://api.epiguard.app`

## 2) Configurazione locale (una volta)

```bash
npm install -g firebase-tools
firebase login
cd /workspaces/epilepsy-wearable-seizure
firebase use --add
```

Seleziona il progetto Firebase corretto e aggiorna `.firebaserc` se necessario.

## 3) Variabili backend lato frontend

Il frontend in `docs/` usa API base configurabile via query string:

```text
https://<tuo-dominio>/?api_base=https://api.epiguard.app
```

Il valore viene salvato in `localStorage` (`epiguard_api_base`).

## 4) Secrets GitHub per deploy automatico

Nel repository GitHub, aggiungi:

- `FIREBASE_PROJECT_ID`: id progetto Firebase (es. `epiguard-web-prod`)
- `FIREBASE_TOKEN`: token CLI ottenuto con:

```bash
firebase login:ci
```

## 5) Deploy automatico

Workflow: `.github/workflows/deploy-firebase-hosting.yml`

Trigger:

- push su `main`
- avvio manuale da Actions (`workflow_dispatch`)

Ogni push su `main` pubblica `docs/` su Firebase Hosting.

## 6) Dominio custom

In Firebase Console:

- Hosting -> Add custom domain
- Configura DNS (`A`/`TXT` richiesti)
- Attendi verifica SSL automatica

Esempio target: `app.epiguard.it`

## 7) Note operative

- Mantieni backend separato e scalabile (Render/Railway + Postgres)
- Usa staging e production con progetti Firebase distinti
- Verifica `Data safety`/privacy policy prima di eventuale pubblicazione Play tramite wrapper