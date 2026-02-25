package com.epilepsy.wearmonitor.sensor

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.random.Random

data class TelemetrySnapshot(
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
    val fallDetected: Boolean
)

class HealthSensorManager {

    private var monitoringJob: Job? = null
    private var totalSteps = 1200
    private var totalCalories = 80f

    fun startMonitoring(scope: CoroutineScope, onDataReceived: (TelemetrySnapshot) -> Unit) {
        monitoringJob?.cancel()

        monitoringJob = scope.launch {
            while (isActive) {
                onDataReceived(simulateTelemetry())
                delay(5000)
            }
        }
    }

    fun stopMonitoring() {
        monitoringJob?.cancel()
        monitoringJob = null
    }

    private fun simulateTelemetry(): TelemetrySnapshot {
        val heartRate = Random.nextInt(58, 108)
        val hrv = Random.nextDouble(22.0, 72.0).toFloat()
        val movement = Random.nextDouble(30.0, 290.0).toFloat()
        val sleepHours = Random.nextDouble(5.0, 8.8).toFloat()
        val medicationTaken = true
        val spo2 = Random.nextDouble(92.0, 99.6).toFloat()
        val respiratoryRate = Random.nextDouble(11.0, 21.0).toFloat()
        val skinTemperature = Random.nextDouble(35.2, 37.8).toFloat()
        totalSteps += Random.nextInt(5, 40)
        totalCalories += Random.nextDouble(0.6, 4.5).toFloat()
        val stressIndex = ((110f - hrv).coerceIn(0f, 100f) / 100f)
        val fallDetected = Random.nextInt(0, 250) == 1

        return TelemetrySnapshot(
            heartRate = heartRate,
            hrv = hrv,
            movement = movement,
            sleepHours = sleepHours,
            medicationTaken = medicationTaken,
            spo2 = spo2,
            respiratoryRate = respiratoryRate,
            skinTemperature = skinTemperature,
            steps = totalSteps,
            stressIndex = stressIndex,
            caloriesBurned = totalCalories,
            fallDetected = fallDetected
        )
    }
}