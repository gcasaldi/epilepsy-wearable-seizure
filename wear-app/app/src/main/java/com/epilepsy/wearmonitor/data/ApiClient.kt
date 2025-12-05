package com.epilepsy.wearmonitor.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
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
    val medication_taken: Boolean
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
}

class ApiClient {
    // IMPORTANTE: Cambia questo con l'indirizzo del tuo server
    private val BASE_URL = "http://YOUR_SERVER_IP:8000/"
    
    private val TOKEN_KEY = stringPreferencesKey("auth_token")
    
    private val client = OkHttpClient.Builder()
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .build()
    
    private val retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
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
