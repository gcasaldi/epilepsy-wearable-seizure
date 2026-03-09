package com.epilepsy.wearmonitor.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.epilepsy.wearmonitor.alert.AlertManager
import com.epilepsy.wearmonitor.data.ApiClient
import com.epilepsy.wearmonitor.data.PhoneBridge
import com.epilepsy.wearmonitor.data.PhysiologicalData
import com.epilepsy.wearmonitor.sensor.HealthSensorManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class MonitoringService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var sensorManager: HealthSensorManager
    private lateinit var apiClient: ApiClient
    private lateinit var phoneBridge: PhoneBridge
    private lateinit var alertManager: AlertManager

    private var monitoringStarted = false
    private var lastHighRiskAlertAt = 0L

    private val monitorPrefs by lazy {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    override fun onCreate() {
        super.onCreate()
        sensorManager = HealthSensorManager(this)
        apiClient = ApiClient()
        phoneBridge = PhoneBridge(this)
        alertManager = AlertManager(this)
        createNotificationChannel()
        createAlertChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            setMonitoringEnabled(false)
            stopMonitoringInternal()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)

        if (!monitoringStarted) {
            monitoringStarted = true
            setMonitoringEnabled(true)
            sensorManager.startMonitoring(serviceScope)
            serviceScope.launch { periodicMonitoringLoop() }
        }
        
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopMonitoringInternal()
        serviceScope.cancel()
    }

    private fun stopMonitoringInternal() {
        if (!monitoringStarted) return
        monitoringStarted = false
        sensorManager.stopMonitoring()
    }

    private suspend fun periodicMonitoringLoop() {
        while (serviceScope.isActive && monitoringStarted) {
            runCatching { evaluateAndDispatchSnapshot() }
            delay(SAMPLE_PERIOD_MS)
        }
    }

    private suspend fun evaluateAndDispatchSnapshot() {
        val snapshot = sensorManager.snapshotState.value
        if (snapshot.heartRate <= 0) {
            return
        }

        val data = PhysiologicalData(
            hrv = snapshot.hrv,
            heart_rate = snapshot.heartRate,
            movement = snapshot.movement,
            sleep_hours = snapshot.sleepHours,
            medication_taken = snapshot.medicationTaken,
            spo2 = snapshot.spo2,
            respiratory_rate = snapshot.respiratoryRate,
            skin_temperature = snapshot.skinTemperature,
            steps = snapshot.steps,
            stress_index = snapshot.stressIndex,
            calories_burned = snapshot.caloriesBurned,
            fall_detected = snapshot.fallDetected
        )

        runCatching {
            apiClient.sendTelemetry(this, data)
        }

        val remote = runCatching { apiClient.predict(this, data) }.getOrNull()
        val riskScore = remote?.risk_score ?: computeLocalRiskScore(snapshot.heartRate, snapshot.hrv, snapshot.sleepHours)
        val riskLevel = remote?.risk_level ?: when {
            riskScore >= 0.67f -> "high"
            riskScore >= 0.34f -> "medium"
            else -> "low"
        }
        val riskMessage = remote?.message ?: when (riskLevel) {
            "high" -> "Rischio alto: attiva piano di sicurezza"
            "medium" -> "Rischio medio: resta monitorato"
            else -> "Rischio basso: parametri stabili"
        }

        runCatching {
            phoneBridge.sendTelemetry(snapshot, riskLevel, riskScore)
        }

        val tensionHigh = snapshot.heartRate >= 110 && snapshot.hrv in 1f..35f
        val highRisk = riskLevel == "high"
        val now = System.currentTimeMillis()
        val canAlert = now - lastHighRiskAlertAt >= ALERT_COOLDOWN_MS

        if ((highRisk || tensionHigh) && canAlert) {
            lastHighRiskAlertAt = now
            val title = if (tensionHigh) "Tensione elevata rilevata" else "Rischio crisi elevato"
            val message = if (tensionHigh) {
                "HR ${snapshot.heartRate} bpm e HRV ${snapshot.hrv.toInt()} ms: fai una pausa e respira profondamente."
            } else {
                riskMessage
            }

            alertManager.triggerHighRiskAlert()
            showAlertNotification(title, message)
            runCatching {
                phoneBridge.sendAlert(title, message, riskLevel, riskScore)
            }
        }
    }

    private fun computeLocalRiskScore(hr: Int, hrv: Float, sleepHours: Float): Float {
        val hrvRisk = ((70f - hrv) / 70f).coerceIn(0f, 1f)
        val hrRisk = ((hr - 85f) / 65f).coerceIn(0f, 1f)
        val sleepRisk = ((7.5f - sleepHours) / 7.5f).coerceIn(0f, 1f)
        return (0.45f * hrvRisk + 0.35f * hrRisk + 0.20f * sleepRisk).coerceIn(0f, 1f)
    }

    private fun showAlertNotification(title: String, message: String) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Monitoraggio Epiguard",
            NotificationManager.IMPORTANCE_LOW
        )
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    private fun createAlertChannel() {
        val channel = NotificationChannel(
            ALERT_CHANNEL_ID,
            "Alert Epiguard",
            NotificationManager.IMPORTANCE_HIGH
        )
        channel.description = "Alert rischio/tensione su smartwatch"
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Epiguard attivo")
            .setContentText("Monitoraggio dei parametri vitali in corso...")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation) // TODO: usare icona app
            .setOngoing(true)
            .build()
    }

    private fun setMonitoringEnabled(enabled: Boolean) {
        monitorPrefs.edit().putBoolean(KEY_MONITORING_ENABLED, enabled).apply()
    }

    companion object {
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "monitoring_channel"
        private const val ALERT_CHANNEL_ID = "monitoring_alerts"
        private const val SAMPLE_PERIOD_MS = 5 * 60 * 1000L
        private const val ALERT_COOLDOWN_MS = 5 * 60 * 1000L
        private const val PREFS_NAME = "epiguard_watch"
        private const val KEY_MONITORING_ENABLED = "monitoring_enabled"
        const val ACTION_START = "com.epilepsy.wearmonitor.action.START_MONITORING"
        const val ACTION_STOP = "com.epilepsy.wearmonitor.action.STOP_MONITORING"

        fun start(context: Context) {
            val intent = Intent(context, MonitoringService::class.java).apply {
                action = ACTION_START
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, MonitoringService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }

        fun shouldAutoStart(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getBoolean(KEY_MONITORING_ENABLED, false)
        }
    }
}
