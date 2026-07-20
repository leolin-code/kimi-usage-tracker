#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pricing;
mod scanner;

use scanner::{ScanFilter, UsageReport};

#[tauri::command]
async fn scan_usage(
    home: Option<String>,
    filter: Option<ScanFilter>,
) -> Result<UsageReport, String> {
    tauri::async_runtime::spawn_blocking(move || scanner::scan(home.as_deref(), filter))
        .await
        .map_err(|error| format!("Usage scan task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn default_kimi_home() -> Result<String, String> {
    scanner::default_kimi_home()
        .map(|path| path.to_string_lossy().into_owned())
        .ok_or_else(|| "Unable to locate the current user home directory".to_string())
}

#[tauri::command]
fn export_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|error| format!("Failed to write export file: {error}"))
}

fn main() {
    if std::env::args().any(|argument| argument == "--diagnose") {
        let start_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_millis().min(i64::MAX as u128) as i64)
            .unwrap_or_default()
            .saturating_sub(30 * 24 * 60 * 60 * 1_000);
        let filter = ScanFilter {
            start_ms: Some(start_ms),
            ..ScanFilter::default()
        };
        match scanner::scan(None, Some(filter)) {
            Ok(report) => {
                println!(
                    "files={} records={} requests={} sessions={} models={} malformed={} oversized={}",
                    report.scanned_files,
                    report.parsed_records,
                    report.requests,
                    report.sessions,
                    report.models.len(),
                    report.malformed_records,
                    report.oversized_records,
                );
                return;
            }
            Err(error) => {
                eprintln!("diagnostic scan failed: {error}");
                std::process::exit(1);
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            default_kimi_home,
            export_text,
            scan_usage
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Kimi Usage Tracker");
}
