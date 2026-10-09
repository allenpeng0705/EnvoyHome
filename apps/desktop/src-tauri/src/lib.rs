use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
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

fn spawn_daemon(app: &tauri::AppHandle) -> Result<(), String> {
  let state = app.state::<DaemonState>();
  {
    let guard = state.child.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
      return Ok(());
    }
  }

  let script =
    resolve_daemon_js(app).ok_or_else(|| {
      "envoyhome-daemon.js not found — build @envoyhome/daemon (ENVOYHOME_DAEMON_JS)".to_string()
    })?;

  let state_dir = std::env::var("ENVOYHOME_STATE_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|_| default_state_dir());

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(DaemonState {
      child: Mutex::new(None),
    })
    .invoke_handler(tauri::generate_handler![daemon_status])
    .setup(|app| {
      let handle = app.handle().clone();
      if let Err(err) = spawn_daemon(&handle) {
        eprintln!("EnvoyHome: daemon supervise skipped: {err}");
      }
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
