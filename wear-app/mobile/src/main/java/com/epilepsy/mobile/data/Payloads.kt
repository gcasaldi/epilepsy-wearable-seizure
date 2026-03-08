package com.epilepsy.mobile.data

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
    val timestamp: Long
)

data class PhoneAlertPayload(
    val title: String,
    val message: String,
    val riskLevel: String,
    val riskScore: Float,
    val timestamp: Long
)
