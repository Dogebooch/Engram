/// Write raw bytes (base64-encoded over IPC) to an absolute path chosen by the
/// native Save-As dialog. A small app command sidesteps the fs-plugin path
/// scoping rules, since the destination is arbitrary and user-selected.
use serde::Serialize;

#[tauri::command]
fn save_bytes(path: String, data_b64: String) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let bytes = STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MedicineVideo {
    id: i64,
    source: String,
    course: String,
    title: String,
    path: String,
    duration_seconds: Option<f64>,
    mtime: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MedicineVideosResult {
    status: String,
    videos: Vec<MedicineVideo>,
    message: Option<String>,
}

#[tauri::command]
fn list_medicine_videos() -> MedicineVideosResult {
    let local = match std::env::var("LOCALAPPDATA") {
        Ok(value) => value,
        Err(_) => {
            return MedicineVideosResult {
                status: "unavailable".into(),
                videos: vec![],
                message: Some("LOCALAPPDATA is not set.".into()),
            };
        }
    };
    let db_path = std::path::Path::new(&local)
        .join("MedicineVideoSearcher")
        .join("search.db");
    if !db_path.exists() {
        return MedicineVideosResult {
            status: "unavailable".into(),
            videos: vec![],
            message: Some(format!("MVS database not found: {}", db_path.display())),
        };
    }

    let conn = match rusqlite::Connection::open(&db_path) {
        Ok(conn) => conn,
        Err(err) => {
            return MedicineVideosResult {
                status: "error".into(),
                videos: vec![],
                message: Some(err.to_string()),
            };
        }
    };

    let mut stmt = match conn.prepare(
        "SELECT id, source, course, title, path, duration_seconds, mtime \
         FROM videos WHERE path LIKE ? ORDER BY source, course, title",
    ) {
        Ok(stmt) => stmt,
        Err(err) => {
            return MedicineVideosResult {
                status: "error".into(),
                videos: vec![],
                message: Some(err.to_string()),
            };
        }
    };

    let rows = match stmt.query_map([r"P:\Medicine Videos%"], |row| {
        Ok(MedicineVideo {
            id: row.get(0)?,
            source: row.get(1)?,
            course: row.get(2)?,
            title: row.get(3)?,
            path: row.get(4)?,
            duration_seconds: row.get(5)?,
            mtime: row.get(6)?,
        })
    }) {
        Ok(rows) => rows,
        Err(err) => {
            return MedicineVideosResult {
                status: "error".into(),
                videos: vec![],
                message: Some(err.to_string()),
            };
        }
    };

    let mut videos = Vec::new();
    for row in rows {
        match row {
            Ok(video) => videos.push(video),
            Err(err) => {
                return MedicineVideosResult {
                    status: "error".into(),
                    videos: vec![],
                    message: Some(err.to_string()),
                };
            }
        }
    }

    MedicineVideosResult {
        status: "ok".into(),
        videos,
        message: None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_bytes, list_medicine_videos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
