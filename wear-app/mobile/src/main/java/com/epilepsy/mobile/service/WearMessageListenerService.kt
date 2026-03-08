package com.epilepsy.mobile.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.epilepsy.mobile.R
import com.epilepsy.mobile.data.PhoneAlertPayload
import com.epilepsy.mobile.data.PhoneTelemetryPayload
import com.epilepsy.mobile.data.TelemetryStore
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.google.gson.Gson

class WearMessageListenerService : WearableListenerService() {
    private val gson = Gson()

    override fun onMessageReceived(messageEvent: MessageEvent) {
        val store = TelemetryStore(applicationContext)
        val raw = messageEvent.data.toString(Charsets.UTF_8)

        when (messageEvent.path) {
            PATH_TELEMETRY -> {
                val payload = runCatching {
                    gson.fromJson(raw, PhoneTelemetryPayload::class.java)
                }.getOrNull() ?: return
                store.saveTelemetry(payload)
            }

            PATH_ALERT -> {
                val payload = runCatching {
                    gson.fromJson(raw, PhoneAlertPayload::class.java)
                }.getOrNull() ?: return
                store.saveAlert(payload)
                showAlertNotification(payload)
            }
        }
    }

    private fun showAlertNotification(alert: PhoneAlertPayload) {
        val manager = getSystemService(NotificationManager::class.java)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Epiguard Alerts",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(alert.title)
            .setContentText(alert.message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        manager.notify(ALERT_NOTIFICATION_ID, notification)
    }

    companion object {
        private const val PATH_TELEMETRY = "/epilepsy/telemetry"
        private const val PATH_ALERT = "/epilepsy/alert"
        private const val CHANNEL_ID = "epiguard_alerts"
        private const val ALERT_NOTIFICATION_ID = 1001
    }
}
