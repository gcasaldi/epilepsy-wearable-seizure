package com.epilepsy.wearmonitor.data

import android.content.Context
import com.epilepsy.wearmonitor.sensor.TelemetrySnapshot
import com.google.android.gms.wearable.Wearable
import com.google.gson.Gson
import kotlinx.coroutines.tasks.await

data class PhoneTelemetryPayload(
    val heartRate: Int,
    val hrv: Float,
    val movement: Float,
    val sleepHours: Float,
    val medicationTaken: Boolean,
    val spo2: Float?,
    val respiratoryRate: Float?,
    val skinTemperature: Float?,
    val steps: Int?,
    val stressIndex: Float?,
    val caloriesBurned: Float?,
    val fallDetected: Boolean,
    val riskLevel: String,
    val riskScore: Float,
    val timestamp: Long = System.currentTimeMillis()
)

data class PhoneAlertPayload(
    val title: String,
    val message: String,
    val riskLevel: String,
    val riskScore: Float,
    val timestamp: Long = System.currentTimeMillis()
)

class PhoneBridge(private val context: Context) {
    private val gson = Gson()

    suspend fun sendTelemetry(snapshot: TelemetrySnapshot, riskLevel: String, riskScore: Float) {
        val payload = PhoneTelemetryPayload(
            heartRate = snapshot.heartRate,
            hrv = snapshot.hrv,
            movement = snapshot.movement,
            sleepHours = snapshot.sleepHours,
            medicationTaken = snapshot.medicationTaken,
            spo2 = snapshot.spo2,
            respiratoryRate = snapshot.respiratoryRate,
            skinTemperature = snapshot.skinTemperature,
            steps = snapshot.steps,
            stressIndex = snapshot.stressIndex,
            caloriesBurned = snapshot.caloriesBurned,
            fallDetected = snapshot.fallDetected,
            riskLevel = riskLevel,
            riskScore = riskScore
        )

        sendToPairedNodes("/epilepsy/telemetry", gson.toJson(payload).toByteArray())
    }

    suspend fun sendAlert(title: String, message: String, riskLevel: String, riskScore: Float) {
        val alert = PhoneAlertPayload(
            title = title,
            message = message,
            riskLevel = riskLevel,
            riskScore = riskScore
        )

        sendToPairedNodes("/epilepsy/alert", gson.toJson(alert).toByteArray())
    }

    private suspend fun sendToPairedNodes(path: String, payload: ByteArray) {
        val nodes = Wearable.getNodeClient(context).connectedNodes.await()
        nodes.forEach { node ->
            runCatching {
                Wearable.getMessageClient(context)
                    .sendMessage(node.id, path, payload)
                    .await()
            }
        }
    }
}