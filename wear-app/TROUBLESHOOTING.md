# 🔧 Troubleshooting Android Studio - Wear OS App

## ❌ L'app non appare sull'emulatore

### ✅ Soluzioni rapide

#### 1. **Pulisci e Rebuilda il progetto**
```
Build > Clean Project
Build > Rebuild Project
```

#### 2. **Verifica emulatore Wear OS**
- Assicurati di usare un **Wear OS emulator** (non un telefono normale)
- API Level minimo: **28** (Android 9)
- Tipo: `Wear OS Small Round`, `Wear OS Large Round`, o `Wear OS Square`

Crea un nuovo emulatore:
```
Tools > Device Manager > Create Device > Wear OS
```

#### 3. **Verifica configurazione Run**
```
Run > Edit Configurations...
- Module: wear-app.app.main
- Deploy: default APK
- Launch: Default Activity
```

#### 4. **Installa manualmente**
```bash
# Dalla directory wear-app/
./gradlew installDebug

# Oppure
./gradlew clean assembleDebug installDebug
```

#### 5. **Controlla Logcat**
```
View > Tool Windows > Logcat
```
Cerca errori come:
- `ClassNotFoundException`
- `SecurityException`
- `Permission denied`

#### 6. **Sync Gradle**
```
File > Sync Project with Gradle Files
```

#### 7. **Invalida cache**
```
File > Invalidate Caches > Invalidate and Restart
```

## 🐛 Problemi comuni risolti

### ✅ Correzioni applicate

1. **minSdk abbassato a 28** - compatibile con più emulatori
2. **MonitoringService commentato** - servizio non implementato causava crash
3. **vectorDrawables abilitato** - per compatibilità icone

### 🔍 Verifica configurazione

**wear-app/app/build.gradle.kts:**
- ✅ `minSdk = 28`
- ✅ `targetSdk = 34`
- ✅ `applicationId = "com.epilepsy.wearmonitor"`

**AndroidManifest.xml:**
- ✅ `android:name=".MainActivity"` esiste
- ✅ `LAUNCHER` intent-filter presente
- ✅ Servizio non implementato commentato

## 📱 Passaggi per testare

1. **Avvia emulatore Wear OS**
   - Deve essere acceso PRIMA di fare Run

2. **Seleziona target**
   - Nella toolbar di Android Studio, seleziona l'emulatore Wear OS dal dropdown

3. **Run app**
   - Clicca il tasto Play verde ▶️
   - Oppure: `Run > Run 'app'`

4. **Attendi installazione**
   - Prima installazione può richiedere 2-3 minuti
   - Controlla progress bar in basso

5. **Trova l'app**
   - Swipe su sull'emulatore
   - Cerca "Epilepsy Monitor" o l'icona 🧠

## 🚨 Se ancora non funziona

### Opzione A: Controlla Gradle output
```
Build > Build Bundle(s) / APK(s) > Build APK(s)
```
Guarda gli errori nel tab "Build"

### Opzione B: Esegui da terminale
```bash
cd wear-app
chmod +x gradlew
./gradlew clean
./gradlew assembleDebug
adb devices  # Verifica che l'emulatore sia connesso
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Opzione C: Verifica ADB
```bash
adb devices
# Dovrebbe mostrare: emulator-5554 device
```

Se non appare:
```bash
adb kill-server
adb start-server
adb devices
```

### Opzione D: Logs dettagliati
```bash
adb logcat | grep -i "epilepsy\|wearmonitor"
```

## 🔧 File modificati

- ✅ `wear-app/app/build.gradle.kts` - minSdk 28, vectorDrawables
- ✅ `wear-app/app/src/main/AndroidManifest.xml` - servizio commentato

## 📞 Serve altro aiuto?

Inviami:
1. Screenshot dell'errore (se presente)
2. Output di: `./gradlew assembleDebug`
3. Logcat dell'app (se crasha)
4. Versione Android Studio e API Level emulatore
