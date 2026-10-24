import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
  /// Alert APNs MethodChannel — Dart `PushService` (`envoyhome/alert_push`).
  private let alertChannelName = "envoyhome/alert_push"
  private var alertChannel: FlutterMethodChannel?
  private var pendingLaunchUserInfo: [AnyHashable: Any]?
  private var channelAttachAttempts = 0
  /// Last APNs device token (hex). Cached so Dart can pull after MethodChannel attaches
  /// — iOS may deliver the token before Flutter's handler is live.
  private var lastAlertTokenHex: String?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    // With UIScene, `window` is nil here — FlutterViewController lives on the
    // scene. Never force-unwrap; wire the MethodChannel once the VC exists.
    let launched = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    UNUserNotificationCenter.current().delegate = self

    if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
      pendingLaunchUserInfo = userInfo
    }

    DispatchQueue.main.async { [weak self] in
      self?.ensureAlertChannel()
    }

    return launched
  }

  override func applicationDidBecomeActive(_ application: UIApplication) {
    super.applicationDidBecomeActive(application)
    ensureAlertChannel()
    // Re-register whenever we become active — APNs token can be delayed or
    // dropped after a kill; local flutter installs need a live device token
    // before home.registerPushToken can run.
    reregisterIfAuthorized()
  }

  /// Resolve FlutterViewController under AppDelegate.window or any UIWindowScene.
  private func flutterViewController() -> FlutterViewController? {
    if let controller = window?.rootViewController as? FlutterViewController {
      return controller
    }
    for scene in UIApplication.shared.connectedScenes {
      guard let windowScene = scene as? UIWindowScene else { continue }
      for sceneWindow in windowScene.windows {
        if let controller = sceneWindow.rootViewController as? FlutterViewController {
          return controller
        }
      }
    }
    return nil
  }

  private func ensureAlertChannel() {
    if alertChannel != nil { return }
    guard let controller = flutterViewController() else {
      // Scene may still be attaching — retry briefly (cap so we never spin).
      channelAttachAttempts += 1
      if channelAttachAttempts <= 40 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
          self?.ensureAlertChannel()
        }
      }
      return
    }
    channelAttachAttempts = 0

    let channel = FlutterMethodChannel(
      name: alertChannelName,
      binaryMessenger: controller.binaryMessenger
    )
    alertChannel = channel
    channel.setMethodCallHandler { [weak self] (call, result) in
      switch call.method {
      case "requestPermissionAndRegister":
        self?.requestAlertPushPermissionAndRegister()
        result(nil)
      case "getAlertToken":
        result(self?.lastAlertTokenHex)
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    if let userInfo = pendingLaunchUserInfo {
      pendingLaunchUserInfo = nil
      forwardPushPayload(userInfo)
    }
  }

  private func requestAlertPushPermissionAndRegister() {
    ensureAlertChannel()
    UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
      case .denied:
        self?.alertChannel?.invokeMethod("onAlertTokenError", arguments: [
          "error": "notification permission denied — enable Notifications for EnvoyHome in Settings",
        ])
      case .notDetermined:
        UNUserNotificationCenter.current().requestAuthorization(
          options: [.alert, .badge, .sound]
        ) { granted, error in
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
      @unknown default:
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
      }
    }
  }

  private func reregisterIfAuthorized() {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }
      default:
        break
      }
    }
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    ensureAlertChannel()
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    lastAlertTokenHex = hex
    alertChannel?.invokeMethod("onAlertToken", arguments: ["token": hex])
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    ensureAlertChannel()
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
    // Do **not** forward here — Design `2026-10-22f` navigation is on **tap**
    // (`userNotificationCenter didReceive`) or cold-start (`pendingLaunchUserInfo`).
    // Background delivery alone must not switch Chat/Schedules tabs.
    completionHandler(.noData)
  }

  private func forwardPushPayload(_ userInfo: [AnyHashable: Any]) {
    ensureAlertChannel()
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
