use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DocumentPayload {
    pub path: Option<String>,
    pub file_name: String,
    pub content: String,
    pub directory: Option<String>,
}

#[derive(Default)]
pub struct CliState {
    pub file_path: Mutex<Option<String>>,
}

#[tauri::command]
fn read_document_file(path: String) -> Result<DocumentPayload, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    let content = fs::read_to_string(&p)
        .map_err(|e| format!("Failed to read file {}: {}", path, e))?;
    let file_name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "document.md".to_string());
    let directory = p
        .parent()
        .map(|dir| dir.to_string_lossy().to_string());

    Ok(DocumentPayload {
        path: Some(path),
        file_name,
        content,
        directory,
    })
}

#[tauri::command]
fn write_document_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }
    fs::write(&p, content)
        .map_err(|e| format!("Failed to write file {}: {}", path, e))?;
    Ok(())
}

#[tauri::command]
fn read_local_asset(base_dir: String, relative_path: String) -> Result<String, String> {
    let base = PathBuf::from(&base_dir);
    let resolved = if Path::new(&relative_path).is_absolute() {
        PathBuf::from(&relative_path)
    } else {
        base.join(&relative_path)
    };

    if !resolved.exists() {
        return Err(format!("Asset not found: {}", resolved.display()));
    }

    let bytes = fs::read(&resolved)
        .map_err(|e| format!("Failed to read asset {}: {}", resolved.display(), e))?;

    let ext = resolved
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    };

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
async fn pick_open_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    app.dialog().file()
        .add_filter("Markdown Files", &["md", "markdown", "mdown", "mkdn", "txt"])
        .add_filter("All Files", &["*"])
        .pick_file(move |file| {
            let _ = tx.blocking_send(file);
        });

    let file = rx.recv().await.flatten();
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
async fn pick_save_file(app: AppHandle, default_name: Option<String>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = app.dialog().file()
        .add_filter("Markdown Files", &["md", "markdown", "mdown", "mkdn"])
        .add_filter("All Files", &["*"]);

    if let Some(name) = default_name {
        builder = builder.set_file_name(&name);
    }

    let (tx, mut rx) = tauri::async_runtime::channel(1);
    builder.save_file(move |file| {
        let _ = tx.blocking_send(file);
    });

    let file = rx.recv().await.flatten();
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
fn get_cli_target_file(state: State<'_, CliState>) -> Result<Option<String>, String> {
    let file = state.file_path.lock().map_err(|e| e.to_string())?.clone();
    Ok(file)
}

#[tauri::command]
fn open_in_browser(app: AppHandle, url: String) -> Result<(), String> {
    // Only allow http or https URLs for security
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http/https links are supported".to_string());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli_state = CliState::default();

    // Inspect command-line arguments for target markdown file
    let args: Vec<String> = std::env::args().collect();
    let mut target_file: Option<String> = None;
    for arg in args.into_iter().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        let path = PathBuf::from(&arg);
        if path.exists() && path.is_file() {
            if let Ok(canonical) = path.canonicalize() {
                target_file = Some(canonical.to_string_lossy().to_string());
                break;
            } else {
                target_file = Some(path.to_string_lossy().to_string());
                break;
            }
        } else if arg.ends_with(".md")
            || arg.ends_with(".markdown")
            || arg.ends_with(".mdown")
            || arg.ends_with(".mkdn")
            || arg.ends_with(".txt")
        {
            target_file = Some(arg);
            break;
        }
    }

    if let Some(target) = target_file {
        if let Ok(mut lock) = cli_state.file_path.lock() {
            *lock = Some(target);
        }
    }

    tauri::Builder::default()
        .manage(cli_state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_document_file,
            write_document_file,
            read_local_asset,
            pick_open_file,
            pick_save_file,
            get_cli_target_file,
            open_in_browser,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
