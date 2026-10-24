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
  // Packaged installer (scripts/stage-desktop-bundle.mjs → resources/daemon/).
  // Prefer `.mjs` (always ESM). A legacy `envoyhome-daemon.js` copy is not staged.
  if let Ok(resource) = app.path().resource_dir() {
    for rel in [
      "daemon/main.mjs",
      "resources/daemon/main.mjs",
    ] {
      let candidate = resource.join(rel);
      if candidate.is_file() {
        return Some(candidate);
      }
    }
  }
  // Dev: checkout dist (tsc) or packaged dist-daemon before install staging.
  if let Ok(cwd) = std::env::current_dir() {
    for rel in [
      "dist-daemon/main.mjs",
      "../dist-daemon/main.mjs",
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
  None
}

/// Prefer `ENVOYHOME_NODE`, then the staged Node sidecar (installer), then PATH `node`.
fn resolve_node_exe(app: &tauri::AppHandle) -> PathBuf {
  if let Ok(raw) = std::env::var("ENVOYHOME_NODE") {
    let trimmed = raw.trim();
    if !trimmed.is_empty() {
      return PathBuf::from(trimmed);
    }
  }
  if let Ok(resource) = app.path().resource_dir() {
    for rel in [
      "node-runtime/bin/node",
      "node-runtime/node.exe",
      "resources/node-runtime/bin/node",
      "resources/node-runtime/node.exe",
    ] {
      let candidate = resource.join(rel);
      if candidate.is_file() {
        return candidate;
      }
    }
  }
  PathBuf::from("node")
}

/// Staged `resources/push/push-config.json` from `stage-desktop-bundle.mjs`.
/// The daemon loads it via `ENVOYHOME_PUSH_CONFIG` and resolves AuthKey / FCM
/// paths relative to that file's directory.
fn resolve_push_config(app: &tauri::AppHandle) -> Option<PathBuf> {
  if let Ok(explicit) = std::env::var("ENVOYHOME_PUSH_CONFIG") {
    let p = PathBuf::from(explicit.trim());
    if p.is_file() {
      return Some(p);
    }
  }
  if let Ok(resource) = app.path().resource_dir() {
    for rel in ["push/push-config.json", "resources/push/push-config.json"] {
      let candidate = resource.join(rel);
      if candidate.is_file() {
        return Some(candidate);
      }
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

fn wait_pid_exit(pid: u32) {
  for _ in 0..20 {
    if !process_alive(pid) {
      return;
    }
    thread::sleep(Duration::from_millis(50));
  }
  if process_alive(pid) {
    kill_pid(pid, true);
    thread::sleep(Duration::from_millis(100));
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
  wait_pid_exit(pid);
}

/// Claim files may live in a different state dir than this launch (dev cwd
/// `.envoyhome` vs `~/.envoyhome`). Sweep common locations before bind.
fn stop_stale_claim_daemons(primary: &PathBuf) {
  let mut dirs = vec![primary.clone()];
  dirs.push(default_state_dir());
  if let Ok(cwd) = std::env::current_dir() {
    dirs.push(cwd.join(".envoyhome"));
    if let Some(parent) = cwd.parent() {
      dirs.push(parent.join(".envoyhome"));
    }
  }
  let mut seen = std::collections::HashSet::new();
  for dir in dirs {
    let key = dir.to_string_lossy().to_string();
    if !seen.insert(key) {
      continue;
    }
    stop_stale_claim_daemon(&dir);
  }
}

/// If an orphan `envoyhome-daemon.js` still holds the default WS/HTTP ports
/// (claim missing or wrong state dir), free them so spawn does not EADDRINUSE-loop.
#[cfg(unix)]
fn stop_orphan_daemon_on_port(port: u16) {
  let output = Command::new("lsof")
    .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN", "-t"])
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .output();
  let Ok(out) = output else {
    return;
  };
  let text = String::from_utf8_lossy(&out.stdout);
  for line in text.lines() {
    let Ok(pid) = line.trim().parse::<u32>() else {
      continue;
    };
    if !process_alive(pid) {
      continue;
    }
    // Only reclaim our own binary — never kill unrelated listeners.
    let cmd = Command::new("ps")
      .args(["-p", &pid.to_string(), "-o", "command="])
      .stdout(Stdio::piped())
      .stderr(Stdio::null())
      .output()
      .ok()
      .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
      .unwrap_or_default();
    if !cmd.contains("envoyhome-daemon") {
      continue;
    }
    eprintln!("EnvoyHome: freeing port {port} held by orphan daemon pid={pid}");
    kill_pid(pid, false);
    wait_pid_exit(pid);
  }
}

#[cfg(not(unix))]
fn stop_orphan_daemon_on_port(_port: u16) {}

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
      "envoyhome-daemon not found — run `pnpm --filter @envoyhome/daemon build` (dev) or `./scripts/build-desktop.sh` (installer), or set ENVOYHOME_DAEMON_JS".to_string()
    })?;
  let node = resolve_node_exe(app);

  let state_dir = std::env::var("ENVOYHOME_STATE_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|_| default_state_dir());

  stop_stale_claim_daemons(&state_dir);
  // Default ports from packages/daemon (ENVOYHOME_WS_PORT / HTTP = WS+1).
  let ws_port: u16 = std::env::var("ENVOYHOME_WS_PORT")
    .ok()
    .and_then(|s| s.parse().ok())
    .unwrap_or(4780);
  stop_orphan_daemon_on_port(ws_port);
  stop_orphan_daemon_on_port(ws_port.saturating_add(1));

  let mut cmd = Command::new(&node);
  cmd
    .arg(&script)
    .env("ENVOYHOME_STATE_DIR", &state_dir)
    .env("ENVOYHOME_MANAGED_BY", "app")
    .stdout(Stdio::null())
    // Inherit stderr so EADDRINUSE / claim errors show in the Tauri console.
    .stderr(Stdio::inherit());
  // Packaged push credentials (APNs + FCM) — see scripts/stage-desktop-bundle.mjs.
  if let Some(push_config) = resolve_push_config(app) {
    cmd.env("ENVOYHOME_PUSH_CONFIG", &push_config);
  }
  let child = cmd
    .spawn()
    .map_err(|e| format!("spawn daemon ({node:?}): {e}"))?;

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

/// Native folder picker for profile workspace root (Design §4.2.1).
/// Works on macOS / Windows / Linux (rfd). Starts in the user home directory
/// when available so “Add folder” is consistent across platforms.
#[tauri::command]
fn pick_workspace_folder() -> Result<Option<String>, String> {
  let mut dialog = rfd::FileDialog::new()
    .set_title("Select workspace folder (or computer root)");
  // HOME (Unix) / USERPROFILE (Windows) — avoid a new crate just for this.
  let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
  if let Some(home) = home {
    dialog = dialog.set_directory(home);
  }
  let path = dialog.pick_folder();
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
      pick_workspace_folder,
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
