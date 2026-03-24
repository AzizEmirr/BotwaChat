#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use xcap::image::codecs::png::{CompressionType, FilterType as PngFilterType, PngEncoder};
use xcap::image::imageops::FilterType;
use xcap::image::{ColorType, DynamicImage, ImageEncoder};
use xcap::{Monitor, Window};

const KEYRING_SERVICE_NAME: &str = "catwa.desktop";

#[derive(Clone, Copy)]
enum ScreenShareSourceKind {
    Window,
    Monitor,
}

#[derive(Clone, Copy)]
struct ScreenShareSourceSelector {
    kind: ScreenShareSourceKind,
    id: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeScreenShareSource {
    id: String,
    label: String,
    description: String,
    thumbnail_data_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeScreenShareSources {
    applications: Vec<NativeScreenShareSource>,
    screens: Vec<NativeScreenShareSource>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeScreenShareFrame {
    data_url: String,
    width: u32,
    height: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupConfiguration {
    enabled: bool,
    start_minimized: bool,
}

#[cfg(target_os = "windows")]
fn startup_script_path() -> Result<PathBuf, String> {
    let app_data =
        std::env::var("APPDATA").map_err(|_| "APPDATA environment variable is missing".to_string())?;
    let mut path = PathBuf::from(app_data);
    path.push("Microsoft");
    path.push("Windows");
    path.push("Start Menu");
    path.push("Programs");
    path.push("Startup");
    path.push("Catwa Startup.cmd");
    Ok(path)
}

#[cfg(not(target_os = "windows"))]
fn startup_script_path() -> Result<PathBuf, String> {
    Err("startup integration is only supported on Windows".to_string())
}

fn read_startup_configuration_internal() -> Result<StartupConfiguration, String> {
    let path = startup_script_path()?;
    if !path.exists() {
        return Ok(StartupConfiguration {
            enabled: false,
            start_minimized: false,
        });
    }

    let content = fs::read_to_string(&path).unwrap_or_default();
    Ok(StartupConfiguration {
        enabled: true,
        start_minimized: content.contains("--start-minimized"),
    })
}

#[tauri::command]
fn read_startup_configuration() -> Result<StartupConfiguration, String> {
    read_startup_configuration_internal()
}

#[tauri::command]
fn configure_startup(enabled: bool, start_minimized: bool) -> Result<StartupConfiguration, String> {
    let path = startup_script_path()?;

    if !enabled {
        if path.exists() {
            fs::remove_file(&path).map_err(|err| format!("remove startup script failed: {err}"))?;
        }
        return read_startup_configuration_internal();
    }

    let exe_path = std::env::current_exe().map_err(|err| format!("resolve current executable failed: {err}"))?;
    let exe_string = exe_path.to_string_lossy().replace('"', "\"\"");
    let args = if start_minimized {
        "--autostart --start-minimized"
    } else {
        "--autostart"
    };
    let script_content = format!("@echo off\r\nstart \"\" \"{exe_string}\" {args}\r\n");

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("create startup directory failed: {err}"))?;
    }

    fs::write(&path, script_content).map_err(|err| format!("write startup script failed: {err}"))?;
    read_startup_configuration_internal()
}

fn keyring_entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE_NAME, key).map_err(|err| format!("keyring init failed: {err}"))
}

#[tauri::command]
fn secure_store_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring_entry(&key)?;
    entry
        .set_password(&value)
        .map_err(|err| format!("keyring write failed: {err}"))
}

#[tauri::command]
fn secure_store_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring_entry(&key)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("keyring read failed: {err}")),
    }
}

#[tauri::command]
fn secure_store_delete(key: String) -> Result<(), String> {
    let entry = keyring_entry(&key)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(format!("keyring delete failed: {err}")),
    }
}

fn sanitize_label(value: String) -> String {
    let trimmed = value
        .replace('\n', " ")
        .replace('\r', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    trimmed.trim().to_string()
}

fn build_source_id(kind: ScreenShareSourceKind, id: u32) -> String {
    match kind {
        ScreenShareSourceKind::Window => format!("window:{id}"),
        ScreenShareSourceKind::Monitor => format!("monitor:{id}"),
    }
}

fn parse_source_id(raw: &str) -> Result<ScreenShareSourceSelector, String> {
    let (prefix, id_raw) = raw
        .split_once(':')
        .ok_or_else(|| "invalid screen share source id".to_string())?;
    let id = id_raw
        .trim()
        .parse::<u32>()
        .map_err(|_| "invalid source numeric id".to_string())?;
    let kind = match prefix {
        "window" => ScreenShareSourceKind::Window,
        "monitor" => ScreenShareSourceKind::Monitor,
        _ => return Err("unsupported source type".to_string()),
    };
    Ok(ScreenShareSourceSelector { kind, id })
}

fn encode_thumbnail(image: xcap::image::RgbaImage) -> Option<String> {
    encode_frame(image, 520, 300, 60)
        .ok()
        .map(|frame| frame.data_url)
}

fn encode_frame(
    image: xcap::image::RgbaImage,
    max_width: u32,
    max_height: u32,
    _quality: u8,
) -> Result<NativeScreenShareFrame, String> {
    let mut dynamic = DynamicImage::ImageRgba8(image);
    let width = dynamic.width();
    let height = dynamic.height();

    let target_width = max_width.max(320);
    let target_height = max_height.max(180);
    if width > target_width || height > target_height {
        dynamic = dynamic.resize(target_width, target_height, FilterType::Triangle);
    }

    let rgba = dynamic.to_rgba8();
    let mut bytes = Vec::new();
    let encoder = PngEncoder::new_with_quality(&mut bytes, CompressionType::Fast, PngFilterType::NoFilter);
    encoder
        .write_image(rgba.as_raw(), rgba.width(), rgba.height(), ColorType::Rgba8.into())
        .map_err(|err| format!("png encode failed: {err}"))?;

    let encoded = BASE64_STANDARD.encode(bytes);
    Ok(NativeScreenShareFrame {
        data_url: format!("data:image/png;base64,{encoded}"),
        width: dynamic.width(),
        height: dynamic.height(),
    })
}

fn collect_window_sources() -> Result<Vec<NativeScreenShareSource>, String> {
    let windows = Window::all().map_err(|err| format!("window source list failed: {err}"))?;
    let mut result = Vec::new();

    for (index, window) in windows.into_iter().enumerate() {
        if window.is_minimized().unwrap_or(false) {
            continue;
        }

        let title = sanitize_label(window.title().unwrap_or_default());
        let app_name = sanitize_label(window.app_name().unwrap_or_default());
        let width = window.width().unwrap_or(0);
        let height = window.height().unwrap_or(0);
        let id = window.id().unwrap_or(index as u32 + 1);

        let label = if !title.is_empty() {
            title
        } else if !app_name.is_empty() {
            app_name.clone()
        } else {
            format!("Pencere {}", index + 1)
        };

        let description = if !app_name.is_empty() {
            format!("{app_name} • {width}x{height}")
        } else {
            format!("{width}x{height}")
        };

        let thumbnail_data_url = window.capture_image().ok().and_then(encode_thumbnail);
        result.push(NativeScreenShareSource {
            id: build_source_id(ScreenShareSourceKind::Window, id),
            label,
            description,
            thumbnail_data_url,
        });
    }

    Ok(result)
}

fn collect_monitor_sources() -> Result<Vec<NativeScreenShareSource>, String> {
    let monitors = Monitor::all().map_err(|err| format!("monitor source list failed: {err}"))?;
    let mut result = Vec::new();

    for (index, monitor) in monitors.into_iter().enumerate() {
        let id = monitor.id().unwrap_or(index as u32 + 1);
        let width = monitor.width().unwrap_or(0);
        let height = monitor.height().unwrap_or(0);
        let scale = monitor.scale_factor().unwrap_or(1.0);
        let raw_name = monitor.name().unwrap_or_default();

        let label = {
            let name = sanitize_label(raw_name);
            if !name.is_empty() {
                name
            } else {
                format!("Ekran {}", index + 1)
            }
        };

        let description = format!("{width}x{height} • {scale:.2}x");
        let thumbnail_data_url = monitor.capture_image().ok().and_then(encode_thumbnail);

        result.push(NativeScreenShareSource {
            id: build_source_id(ScreenShareSourceKind::Monitor, id),
            label,
            description,
            thumbnail_data_url,
        });
    }

    Ok(result)
}

fn capture_image_for_source(selector: ScreenShareSourceSelector) -> Result<xcap::image::RgbaImage, String> {
    match selector.kind {
        ScreenShareSourceKind::Window => {
            let windows = Window::all().map_err(|err| format!("window source refresh failed: {err}"))?;
            let window = windows
                .into_iter()
                .find(|item| item.id().ok() == Some(selector.id))
                .ok_or_else(|| "selected window was not found".to_string())?;

            window
                .capture_image()
                .map_err(|err| format!("window capture failed: {err}"))
        }
        ScreenShareSourceKind::Monitor => {
            let monitors = Monitor::all().map_err(|err| format!("monitor source refresh failed: {err}"))?;
            let monitor = monitors
                .into_iter()
                .find(|item| item.id().ok() == Some(selector.id))
                .ok_or_else(|| "selected monitor was not found".to_string())?;

            monitor
                .capture_image()
                .map_err(|err| format!("monitor capture failed: {err}"))
        }
    }
}

#[tauri::command]
fn screen_share_list_sources() -> Result<NativeScreenShareSources, String> {
    Ok(NativeScreenShareSources {
        applications: collect_window_sources()?,
        screens: collect_monitor_sources()?,
    })
}

#[tauri::command]
fn screen_share_capture_frame(
    source_id: String,
    max_width: Option<u32>,
    max_height: Option<u32>,
    jpeg_quality: Option<u8>,
) -> Result<NativeScreenShareFrame, String> {
    let selector = parse_source_id(source_id.trim())?;
    let image = capture_image_for_source(selector)?;
    encode_frame(
        image,
        max_width.unwrap_or(1920),
        max_height.unwrap_or(1080),
        jpeg_quality.unwrap_or(78),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    let start_minimized = std::env::args().any(|arg| arg == "--start-minimized");

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            if start_minimized {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.minimize();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secure_store_set,
            secure_store_get,
            secure_store_delete,
            screen_share_list_sources,
            screen_share_capture_frame,
            configure_startup,
            read_startup_configuration
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
