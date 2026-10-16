use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Manager;

struct DaemonState {
  child: Mutex<Option<Child>>,
}

fn default_state_dir() -> PathBuf {
  let home = std::env::var_os("HOME")
    .or_else(|| std::env::var_os("USERPROFILE"))
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from("."));
  home.join(".envoyhome")
}

fn resolve_daemon_js(app: &tauri::AppHandle) -> Option<PathBuf> {
  if let Ok(explicit) = std::env::var("ENVOYHOME_DAEMON_JS") {
    let p = PathBuf::from(explicit);
    if p.exists() {
      return Some(p);
    }
  }
  // From apps/desktop (tauri cwd) or apps/desktop/src-tauri.
  if let Ok(cwd) = std::env::current_dir() {
    for rel in [
      "packages/daemon/dist/bin/envoyhome-daemon.js",
      "../packages/daemon/dist/bin/envoyhome-daemon.js",
      "../../packages/daemon/dist/bin/envoyhome-daemon.js",
      "../../../packages/daemon/dist/bin/envoyhome-daemon.js",
    ] {
      let candidate = cwd.join(rel);
      if candidate.exists() {
        return Some(candidate.canonicalize().unwrap_or(candidate));
      }
    }
  }
  if let Ok(resource) = app.path().resource_dir() {
    let bundled = resource.join("envoyhome-daemon.js");
    if bundled.exists() {
      return Some(bundled);
    }
  }
  None
}

fn process_alive(pid: u32) -> bool {
  if pid == 0 {
    return false;
  }
  #[cfg(unix)]
  {
    Command::new("kill")
      .args(["-0", &pid.to_string()])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status()
      .map(|s| s.success())
      .unwrap_or(false)
  }
  #[cfg(windows)]
  {
    Command::new("tasklist")
      .args(["/FI", &format!("PID eq {pid}"), "/NH"])
      .stdout(Stdio::piped())
      .stderr(Stdio::null())
      .output()
      .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
      .unwrap_or(false)
  }
  #[cfg(not(any(unix, windows)))]
  {
    let _ = pid;
    false
  }
}

fn kill_pid(pid: u32, force: bool) {
  #[cfg(unix)]
  {
    let sig = if force { "-9" } else { "-TERM" };
    let _ = Command::new("kill")
      .args([sig, &pid.to_string()])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
  }
  #[cfg(windows)]
  {
    let _ = force;
    let _ = Command::new("taskkill")
      .args(["/PID", &pid.to_string(), "/F"])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .status();
  }
}

/// Stop a leftover `managedBy=app` daemon from a prior launch so we always
/// boot the current `dist/` (otherwise RPCs like `home.startDemoHa` fail with
/// `version_too_low` against a stale process holding the claim port).
fn stop_stale_claim_daemon(state_dir: &PathBuf) {
  let claim_path = state_dir.join("daemon.claim.json");
  let Ok(raw) = fs::read_to_string(&claim_path) else {
    return;
  };
  let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
    return;
  };
  let managed = v.get("managedBy").and_then(|x| x.as_str()).unwrap_or("");
  if managed != "app" {
    return;
  }
  let Some(pid) = v.get("pid").and_then(|x| x.as_u64()).map(|p| p as u32) else {
    return;
  };
  if !process_alive(pid) {
    return;
  }
  eprintln!("EnvoyHome: replacing stale managed daemon pid={pid}");
  kill_pid(pid, false);
  for _ in 0..20 {
    if !process_alive(pid) {
      break;
    }
    thread::sleep(Duration::from_millis(50));
  }
  if process_alive(pid) {
    kill_pid(pid, true);
    thread::sleep(Duration::from_millis(100));
  }
}

fn spawn_daemon(app: &tauri::AppHandle) -> Result<(), String> {
  let state = app.state::<DaemonState>();
  {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
      // Still running — keep supervising this child.
      match child.try_wait() {
        Ok(None) => return Ok(()),
        Ok(Some(status)) => {
          eprintln!("EnvoyHome: supervised daemon exited ({status}); respawning");
          *guard = None;
        }
        Err(err) => {
          eprintln!("EnvoyHome: daemon wait failed ({err}); respawning");
          *guard = None;
        }
      }
    }
  }

  let script =
    resolve_daemon_js(app).ok_or_else(|| {
      "envoyhome-daemon.js not found — build @envoyhome/daemon (ENVOYHOME_DAEMON_JS)".to_string()
    })?;

  let state_dir = std::env::var("ENVOYHOME_STATE_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|_| default_state_dir());

  stop_stale_claim_daemon(&state_dir);

  let child = Command::new("node")
    .arg(&script)
    .env("ENVOYHOME_STATE_DIR", &state_dir)
    .env("ENVOYHOME_MANAGED_BY", "app")
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("spawn daemon: {e}"))?;

  let mut guard = state.child.lock().map_err(|e| e.to_string())?;
  *guard = Some(child);
  Ok(())
}

/// Keep the Node daemon alive for the life of the Settings window.
fn start_daemon_watchdog(app: tauri::AppHandle) {
  thread::spawn(move || loop {
    thread::sleep(Duration::from_secs(2));
    if let Err(err) = spawn_daemon(&app) {
      eprintln!("EnvoyHome: daemon watchdog: {err}");
    }
  });
}

fn stop_daemon(app: &tauri::AppHandle) {
  let state = app.state::<DaemonState>();
  if let Ok(mut guard) = state.child.lock() {
    if let Some(mut child) = guard.take() {
      let _ = child.kill();
      let _ = child.wait();
    }
  };
}

#[tauri::command]
fn daemon_status(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
  let state = app.state::<DaemonState>();
  let running = state.child.lock().map(|g| g.is_some()).unwrap_or(false);
  Ok(serde_json::json!({ "supervised": running }))
}

/// Native folder picker for Skills → path install.
#[tauri::command]
fn pick_skill_folder() -> Result<Option<String>, String> {
  let path = rfd::FileDialog::new()
    .set_title("Select skill folder")
    .pick_folder();
  Ok(path.map(|p| p.to_string_lossy().into_owned()))
}

/// Native file picker for a SKILL.md (or any .md) skill file.
#[tauri::command]
fn pick_skill_file() -> Result<Option<String>, String> {
  let path = rfd::FileDialog::new()
    .set_title("Select SKILL.md")
    .add_filter("Skill markdown", &["md"])
    .pick_file();
  Ok(path.map(|p| p.to_string_lossy().into_owned()))
}

/// Open http(s) URLs in the system browser (webview `target=_blank` is a no-op).
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  let trimmed = url.trim();
  if trimmed.is_empty() {
    return Err("empty url".into());
  }
  let lower = trimmed.to_ascii_lowercase();
  if !(lower.starts_with("https://") || lower.starts_with("http://")) {
    return Err("only http(s) URLs allowed".into());
  }
  // Reject control chars and quoting tricks. Query `&` / `%` stay allowed for
  // real http(s) URLs — Windows must not route through unquoted `cmd /C start`.
  if trimmed.bytes().any(|b| b <= 0x1f || matches!(b, b';' | b'"' | b'\\' | b'|')) {
    return Err("url contains disallowed characters".into());
  }

  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg(trimmed)
      .spawn()
      .map_err(|e| format!("open: {e}"))?;
  }
  #[cfg(target_os = "linux")]
  {
    Command::new("xdg-open")
      .arg(trimmed)
      .spawn()
      .map_err(|e| format!("xdg-open: {e}"))?;
  }
  #[cfg(target_os = "windows")]
  {
    // Pass the URL via env so `&` / `%` / `^` in query strings cannot become
    // extra `cmd` tokens (Bugbot: cmd injection via open_external_url).
    Command::new("powershell.exe")
      .args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Start-Process -FilePath $env:ENVOYHOME_OPEN_URL",
      ])
      .env("ENVOYHOME_OPEN_URL", trimmed)
      .spawn()
      .map_err(|e| format!("start: {e}"))?;
  }
  #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
  {
    return Err("open_external_url unsupported on this OS".into());
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(DaemonState {
      child: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![
      daemon_status,
      pick_skill_folder,
      pick_skill_file,
      open_external_url
    ])
    .setup(|app| {
      let handle = app.handle().clone();
      if let Err(err) = spawn_daemon(&handle) {
        eprintln!("EnvoyHome: daemon supervise skipped: {err}");
      }
      start_daemon_watchdog(handle);
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::Destroyed = event {
        if window.label() == "main" {
          stop_daemon(window.app_handle());
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running EnvoyHome");
}
