# Politica di Data Retention

Questa specifica definisce la politica di conservazione dei dati per i dati sensibili dei pazienti, in linea con i requisiti di privacy e gestione del ciclo di vita dei dati.

## 1) Requisito di retention

- **Periodo di conservazione:** I dati dei pazienti devono essere conservati per un periodo minimo e massimo di 5 anni.
- **Cancellazione progressiva:** Allo scadere dei 5 anni, i dati non devono essere eliminati in massa. La cancellazione deve avvenire in modo progressivo (finestra mobile o "rolling window").
- **Obiettivo:** Garantire che il sistema mantenga sempre disponibili gli ultimi 5 anni di dati storici, eliminando solo i record più vecchi giorno per giorno.

## 2) Dati soggetti alla policy

La policy di retention si applica ai seguenti modelli di dati che contengono informazioni dirette sul paziente:

1.  **Telemetria (`PhysiologicalData`):** Dati grezzi dei sensori (HRV, battito, movimento, ecc.).
2.  **Dati di Rischio (`RiskPrediction`):** Punteggi di rischio e predizioni generate dal sistema.
3.  **Dati sulle Terapie (`TherapyRequest`):** Informazioni sui farmaci e le terapie seguite dall'utente.

**Log di sistema e consensi sono esclusi** da questa specifica policy e seguono cicli di vita differenti.

## 3) Implementazione Tecnica

### A) Prerequisiti: Timestamp

Tutti i record soggetti a questa policy **devono** avere un campo timestamp che ne tracci la data di creazione.
- `PhysiologicalData`: utilizza il campo `timestamp`.
- `RiskPrediction`: utilizza il campo `timestamp`.
- `TherapyRequest`: deve essere aggiunto un campo `created_at` con la data di creazione del record.

### B) Indicizzazione

Il campo timestamp di ogni tabella/collection interessata deve essere **indicizzato** per garantire che le query di cancellazione siano performanti e non impattino le operazioni del database.

### C) Job di Cleanup Schedulato

- **Componente:** Verrà creato uno script dedicato (es. `app/cleanup_worker.py`).
- **Logica:** Lo script si connetterà al database ed eseguirà una query per eliminare i record la cui data è antecedente a "oggi - 5 anni".
  - Esempio SQL: `DELETE FROM table_name WHERE timestamp < (CURRENT_DATE - INTERVAL '5 years');`
- **Schedulazione:** Il job verrà eseguito periodicamente, preferibilmente con cadenza giornaliera (es. tramite cron-job o un servizio cloud come Google Cloud Scheduler).

### D) Logging e Audit

- Ogni esecuzione del job di cleanup **deve** produrre un log strutturato.
- Il log conterrà:
    - Timestamp di esecuzione.
    - Tabelle/collection elaborate.
    - Numero di record eliminati per ogni tabella.
    - Eventuali errori riscontrati.
- Questo garantisce la tracciabilità e la verificabilità del processo di cancellazione.

## 4) Requisito Funzionale: Analisi AI per l'Utente

Oltre alla gestione del ciclo di vita dei dati, l'AI deve fornire un'analisi continua dei dati storici e correnti per l'utente.

- **Input:** Dati telemetrici (`PhysiologicalData`), storico delle terapie (`TherapyRequest`), e andamento del rischio (`RiskPrediction`).
- **Output:** Un'analisi personalizzata per l'utente che metta in relazione l'aderenza alla terapia con i dati fisiologici e il livello di rischio.
- **Scopo:** Fornire insight utili all'utente per comprendere meglio la propria condizione e l'efficacia della terapia, senza sostituire il parere medico.
- **Implementazione:** Questo richiede un endpoint API dedicato e un modello AI addestrato per questo scopo specifico. La discussione di questo modello è fuori dallo scopo di questo documento.

## 5) Principi chiave

- **Nessuna cancellazione massiva:** Il sistema è progettato per evitare l'eliminazione di grandi volumi di dati in un'unica operazione.
- **Integrità dei dati recenti:** La logica a finestra mobile assicura che non vengano mai persi dati all'interno del periodo di conservazione di 5 anni.
- **Cancellazione graduale:** Anche in presenza di dati storici antecedenti ai 5 anni, il cleanup procederà gradualmente nel tempo.
