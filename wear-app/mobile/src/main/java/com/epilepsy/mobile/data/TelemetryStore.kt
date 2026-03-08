package com.epilepsy.mobile.data

import android.content.Context
import com.google.gson.Gson

class TelemetryStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    fun saveTelemetry(payload: PhoneTelemetryPayload) {
        prefs.edit().putString(KEY_TELEMETRY, gson.toJson(payload)).apply()
    }

    fun saveAlert(payload: PhoneAlertPayload) {
        prefs.edit().putString(KEY_ALERT, gson.toJson(payload)).apply()
    }

    fun getTelemetry(): PhoneTelemetryPayload? {
        val raw = prefs.getString(KEY_TELEMETRY, null) ?: return null
        return runCatching { gson.fromJson(raw, PhoneTelemetryPayload::class.java) }.getOrNull()
    }

    fun getAlert(): PhoneAlertPayload? {
        val raw = prefs.getString(KEY_ALERT, null) ?: return null
        return runCatching { gson.fromJson(raw, PhoneAlertPayload::class.java) }.getOrNull()
    }

    companion object {
        private const val PREFS_NAME = "epiguard_mobile"
        private const val KEY_TELEMETRY = "latest_telemetry"
        private const val KEY_ALERT = "latest_alert"
    }
}
