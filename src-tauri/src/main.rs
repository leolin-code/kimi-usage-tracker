mod pricing;
mod scanner;

use scanner::UsageReport;

#[tauri::command]
async fn scan_usage(home: Option<String>, days: Option<u32>) -> Result<UsageReport, String> {
    tauri::async_runtime::spawn_blocking(move || scanner::scan(home.as_deref(), days))
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

fn main() {
    if std::env::args().any(|argument| argument == "--diagnose") {
        match scanner::scan(None, Some(30)) {
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
        .invoke_handler(tauri::generate_handler![default_kimi_home, scan_usage])
        .run(tauri::generate_context!())
        .expect("failed to run Kimi Usage Tracker");
}
