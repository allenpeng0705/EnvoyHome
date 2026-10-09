import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
  /// Alert APNs MethodChannel — Dart `PushService` (`envoyhome/alert_push`).
  private let alertChannelName = "envoyhome/alert_push"
  private var alertChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    let controller = window?.rootViewController as! FlutterViewController
    let alertChannel = FlutterMethodChannel(
      name: alertChannelName,
      binaryMessenger: controller.binaryMessenger
    )
    self.alertChannel = alertChannel
    alertChannel.setMethodCallHandler { [weak self] (call, result) in
      switch call.method {
      case "requestPermissionAndRegister":
        self?.requestAlertPushPermissionAndRegister()
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    let launched = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    UNUserNotificationCenter.current().delegate = self

    if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
      DispatchQueue.main.async { [weak self] in
        self?.forwardPushPayload(userInfo)
      }
    }

    return launched
  }

  private func requestAlertPushPermissionAndRegister() {
    UNUserNotificationCenter.current().requestAuthorization(
      options: [.alert, .badge, .sound]
    ) { [weak self] granted, error in
      if let error = error {
        self?.alertChannel?.invokeMethod("onAlertTokenError", arguments: [
          "error": error.localizedDescription,
        ])
      }
      guard granted else {
        self?.alertChannel?.invokeMethod("onAlertTokenError", arguments: [
          "error": "notification permission denied",
        ])
        return
      }
      DispatchQueue.main.async {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    alertChannel?.invokeMethod("onAlertToken", arguments: ["token": hex])
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    alertChannel?.invokeMethod("onAlertTokenError", arguments: [
      "error": error.localizedDescription,
    ])
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge])
  }

  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    forwardPushPayload(response.notification.request.content.userInfo)
    completionHandler()
  }

  override func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    forwardPushPayload(userInfo)
    completionHandler(.newData)
  }

  private func forwardPushPayload(_ userInfo: [AnyHashable: Any]) {
    var payload: [String: Any] = [:]
    if let data = userInfo["data"] as? [String: Any] {
      payload = data
    } else {
      for (key, value) in userInfo {
        if let key = key as? String, key != "aps" {
          payload[key] = value
        }
      }
    }
    guard !payload.isEmpty else { return }
    alertChannel?.invokeMethod("onNotificationTap", arguments: payload)
  }
}
