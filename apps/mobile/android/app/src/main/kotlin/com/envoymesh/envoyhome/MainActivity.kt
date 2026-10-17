package com.envoymesh.envoyhome

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

/**
 * EnvoyHome phone shell — applicationId `com.envoymesh.envoyhome`.
 * Creates the FCM notification channel used by FirebaseMessaging meta-data.
 */
class MainActivity : FlutterActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    ensureAlertChannel()
  }

  private fun ensureAlertChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "EnvoyHome alerts",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Approvals and schedule notifications from your home daemon"
    }
    mgr.createNotificationChannel(channel)
  }

  companion object {
    const val CHANNEL_ID = "envoyhome_alerts"
  }
}
