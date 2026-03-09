package com.epilepsy.wearmonitor.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.epilepsy.wearmonitor.BuildConfig
import com.google.gson.Gson
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

// DataStore extension
private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

// API Models
data class LoginRequest(val username: String, val password: String)
data class LoginResponse(val access_token: String, val username: String)
data class PhysiologicalData(
    val hrv: Float,
    val heart_rate: Int,
    val movement: Float,
    val sleep_hours: Float,
    val medication_taken: Boolean,
    val spo2: Float? = null,
    val respiratory_rate: Float? = null,
    val skin_temperature: Float? = null,
    val steps: Int? = null,
    val stress_index: Float? = null,
    val calories_burned: Float? = null,
    val fall_detected: Boolean? = null
)
data class PredictionResponse(
    val risk_score: Float,
    val risk_level: String,
    val message: String
)

// Retrofit API Interface
interface EpilepsyApi {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse
    
    @POST("api/predict")
    suspend fun predict(
        @Header("Authorization") token: String,
        @Body data: PhysiologicalData
    ): PredictionResponse

    @POST("api/telemetry")
    suspend fun telemetry(
        @Header("Authorization") token: String,
        @Body data: PhysiologicalData
    ): Map<String, Any>
}

class ApiClient {
    private val baseUrl = BuildConfig.API_BASE_URL.let {
        if (it.endsWith('/')) it else "$it/"
    }
    
    private val TOKEN_KEY = stringPreferencesKey("auth_token")
    
    private val client = OkHttpClient.Builder()
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .build()
    
    private val retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
    
    private val api = retrofit.create(EpilepsyApi::class.java)
    
    suspend fun login(context: Context, username: String, password: String): Boolean {
        return try {
            val response = api.login(LoginRequest(username, password))
            saveToken(context, response.access_token)
            true
        } catch (e: Exception) {
            false
        }
    }
    
    suspend fun predict(context: Context, data: PhysiologicalData): PredictionResponse {
        val token = getStoredToken(context) ?: throw Exception("Not logged in")
        return api.predict("Bearer $token", data)
    }

    suspend fun sendTelemetry(context: Context, data: PhysiologicalData): Boolean {
        val token = getStoredToken(context) ?: return false
        return runCatching {
            api.telemetry("Bearer $token", data)
            true
        }.getOrDefault(false)
    }
    
    private suspend fun saveToken(context: Context, token: String) {
        context.dataStore.edit { preferences ->
            preferences[TOKEN_KEY] = token
        }
    }
    
    suspend fun getStoredToken(context: Context): String? {
        return context.dataStore.data.map { preferences ->
            preferences[TOKEN_KEY]
        }.first()
    }
}
