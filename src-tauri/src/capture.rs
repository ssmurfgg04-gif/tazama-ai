//! Screen capture + UI element inspection + computer-use — Tazama AI (Plan C)
//!
//! Uses xcap for frame capture, uiautomation for element walk,
//! and PowerShell/SendKeys for actuation (no unsafe Win32 required).
//!
//! Better than HeyClicky's ScreenCaptureKit because xcap is cross-platform
//! and the uiautomation crate handles DPI automatically.

use base64::Engine as _;
use serde::{Deserialize, Serialize};

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenElement {
    pub name:         String,
    pub control:      String,
    pub x:            i32,
    pub y:            i32,
    pub width:        i32,
    pub height:       i32,
    pub automation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotResult {
    pub base64_png:   String,
    pub width_px:     u32,
    pub height_px:    u32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CUAction {
    pub name:         String,
    pub coordinate:   Option<[i32; 2]>,
    pub text:         Option<String>,
    pub direction:    Option<String>,
    pub amount:       Option<i32>,
    pub repeat:       Option<u32>,
    pub scale_factor: Option<f64>,
}

// ─── Scale helper ─────────────────────────────────────────────────────────────
// Anthropic computer_toolset_20260801: long edge ≤1568, total ≤1.15M px

fn compute_scale(w: u32, h: u32) -> f64 {
    let long_scale  = 1568.0 / (w.max(h) as f64);
    let total_scale = (1_150_000.0_f64 / (w as f64 * h as f64)).sqrt();
    1.0_f64.min(long_scale).min(total_scale)
}

// ─── Screenshot ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn screenshot() -> Result<ScreenshotResult, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("monitor list: {e}"))?;
    let monitor  = monitors.into_iter().next()
        .ok_or_else(|| "no monitors found".to_string())?;
    let image    = monitor.capture_image().map_err(|e| format!("capture: {e}"))?;
    let (w, h)   = (image.width(), image.height());
    let scale    = compute_scale(w, h);
    let (ow, oh) = ((w as f64 * scale) as u32, (h as f64 * scale) as u32);

    let resized: image::RgbaImage = if scale < 0.999 {
        image::imageops::resize(&image, ow, oh, image::imageops::FilterType::Lanczos3)
    } else {
        image
    };

    let mut buf: Vec<u8> = Vec::new();
    {
        use image::ImageEncoder;
        let enc = image::codecs::png::PngEncoder::new(std::io::Cursor::new(&mut buf));
        enc.write_image(
            resized.as_raw(),
            ow, oh,
            image::ExtendedColorType::Rgba8,
        ).map_err(|e| format!("encode: {e}"))?;
    }

    Ok(ScreenshotResult {
        base64_png:   base64::engine::general_purpose::STANDARD.encode(&buf),
        width_px:     ow,
        height_px:    oh,
        scale_factor: scale,
    })
}

// ─── UI Element walk ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_ui_elements(max_depth: Option<u32>) -> Vec<ScreenElement> {
    let depth = max_depth.unwrap_or(3).min(5);
    let mut out = Vec::new();

    let Ok(auto) = uiautomation::UIAutomation::new() else { return out; };
    let Ok(root) = auto.get_root_element()              else { return out; };

    walk(&auto, &root, depth, &mut out);
    out
}

fn walk(
    auto: &uiautomation::UIAutomation,
    el: &uiautomation::UIElement,
    depth: u32,
    out: &mut Vec<ScreenElement>,
) {
    if depth == 0 { return; }

    let name    = el.get_name().unwrap_or_default();
    let control = el.get_control_type()
        .map(|c| format!("{c:?}"))
        .unwrap_or_else(|_| "Unknown".into());

    if let Ok(rect) = el.get_bounding_rectangle() {
        let x = rect.get_left();
        let y = rect.get_top();
        let w = rect.get_width();
        let h = rect.get_height();
        if x >= 0 && y >= 0 && x <= 4000 && y <= 4000 && w > 0 && h > 0 {
            out.push(ScreenElement {
                name: name.clone(),
                control,
                x, y,
                width:  w,
                height: h,
                automation_id: el.get_automation_id().ok(),
            });
        }
    }

    // Walk children via tree walker
    if depth > 1 {
        if let Ok(walker) = auto.create_tree_walker() {
            if let Ok(child) = walker.get_first_child(el) {
                walk(auto, &child, depth - 1, out);
                let mut cur = child;
                while let Ok(sib) = walker.get_next_sibling(&cur) {
                    walk(auto, &sib, depth - 1, out);
                    cur = sib;
                }
            }
        }
    }
}

// ─── Computer-use executor ────────────────────────────────────────────────────
// Uses PowerShell for mouse/keyboard (avoids unsafe Win32 complexity)
// and matches Anthropic computer_toolset_20260801 batch semantics.

#[tauri::command]
pub fn cu_exec(action: CUAction) -> Result<String, String> {
    let scale = action.scale_factor.unwrap_or(1.0);
    let to_screen = |c: [i32; 2]| -> (i32, i32) {
        ((c[0] as f64 / scale) as i32, (c[1] as f64 / scale) as i32)
    };

    match action.name.as_str() {
        "screenshot" | "zoom" => Ok("OK".to_string()),

        "left_click" | "right_click" | "double_click" => {
            let c    = action.coordinate.ok_or("coordinate required")?;
            let (x, y) = to_screen(c);
            let btn  = if action.name == "right_click" { "Right" } else { "Left" };
            let dbl  = action.name == "double_click";
            let ps   = format!(
                "Add-Type -AssemblyName System.Windows.Forms; \
                 [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point({x},{y}); \
                 [System.Windows.Forms.SendKeys]::SendWait('');",
            );
            // Move cursor
            ps_run(&format!(
                "Add-Type -AssemblyName System.Windows.Forms; \
                 [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point({x},{y});"
            ))?;
            // Click via mouse_event alternative — use .NET SendKeys after focus
            let click_count = if dbl { 2 } else { 1 };
            for _ in 0..click_count {
                ps_run(&format!(
                    "Add-Type @'\n\
                     using System; using System.Runtime.InteropServices;\n\
                     public class M {{ [DllImport(\"user32.dll\")] public static extern void mouse_event(uint f,int x,int y,int d,int i); }}\n\
                     '@;\n\
                     [M]::mouse_event(0x{:X},0,0,0,0); [M]::mouse_event(0x{:X},0,0,0,0);",
                    if btn == "Right" { 8u32 } else { 2u32 },
                    if btn == "Right" { 16u32 } else { 4u32 },
                ))?;
            }
            let _ = ps; Ok("OK".to_string())
        }

        "type" => {
            let text = action.text.ok_or("text required")?;
            // Escape special SendKeys chars — single pass, because chained
            // `.replace` calls re-process characters introduced by earlier
            // passes (e.g. `{` -> `{{}}` then corrupts the inserted `}`).
            let mut escaped = String::with_capacity(text.len());
            for c in text.chars() {
                match c {
                    '{' => escaped.push_str("{{}"),
                    '}' => escaped.push_str("{}}"),
                    '(' => escaped.push_str("{(}"),
                    ')' => escaped.push_str("{)}"),
                    '[' => escaped.push_str("{[}"),
                    ']' => escaped.push_str("{]}"),
                    '+' => escaped.push_str("{+}"),
                    '^' => escaped.push_str("{^}"),
                    '%' => escaped.push_str("{%}"),
                    '~' => escaped.push_str("{~}"),
                    _   => escaped.push(c),
                }
            }
            ps_run(&format!(
                "Add-Type -AssemblyName System.Windows.Forms; \
                 [System.Windows.Forms.SendKeys]::SendWait('{escaped}');"
            ))?;
            Ok("OK".to_string())
        }

        "key" => {
            let key_str = action.text.ok_or("text required")?;
            let repeats = action.repeat.unwrap_or(1).min(100);
            let sendkey = key_to_sendkeys(&key_str)?;
            for _ in 0..repeats {
                ps_run(&format!(
                    "Add-Type -AssemblyName System.Windows.Forms; \
                     [System.Windows.Forms.SendKeys]::SendWait('{sendkey}');"
                ))?;
            }
            Ok("OK".to_string())
        }

        "scroll" => {
            let c    = action.coordinate.unwrap_or([400, 300]);
            let (x, y) = to_screen(c);
            let amt  = action.amount.unwrap_or(3) * 120;
            let dir  = action.direction.as_deref().unwrap_or("down");
            let delta = if dir == "down" || dir == "right" { -amt } else { amt };
            ps_run(&format!(
                "Add-Type @'\n\
                 using System; using System.Runtime.InteropServices;\n\
                 public class S {{ [DllImport(\"user32.dll\")] public static extern void mouse_event(uint f,int x,int y,int d,int i); }}\n\
                 '@;\n\
                 Add-Type -AssemblyName System.Windows.Forms;\n\
                 [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point({x},{y});\n\
                 [S]::mouse_event(0x800,0,0,{delta},0);"
            ))?;
            Ok("OK".to_string())
        }

        "cursor_position" => {
            let out = ps_run(
                "Add-Type -AssemblyName System.Windows.Forms; \
                 $p=[System.Windows.Forms.Cursor]::Position; Write-Output \"X=$($p.X), Y=$($p.Y)\""
            )?;
            Ok(out.trim().to_string())
        }

        "mouse_move" => {
            let c = action.coordinate.ok_or("coordinate required")?;
            let (x, y) = to_screen(c);
            ps_run(&format!(
                "Add-Type -AssemblyName System.Windows.Forms; \
                 [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point({x},{y});"
            ))?;
            Ok("OK".to_string())
        }

        "wait" => {
            let secs = action.amount.unwrap_or(1).min(30) as u64;
            std::thread::sleep(std::time::Duration::from_secs(secs));
            Ok("OK".to_string())
        }

        other => Err(format!("unsupported action: {other}")),
    }
}

fn ps_run(script: &str) -> Result<String, String> {
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| format!("powershell: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

fn key_to_sendkeys(key: &str) -> Result<String, String> {
    let mut result = String::new();
    for part in key.split('+') {
        match part.to_ascii_lowercase().as_str() {
            "ctrl"|"control" => result.push('^'),
            "shift"          => result.push('+'),
            "alt"            => result.push('%'),
            "return"|"enter" => result.push_str("{ENTER}"),
            "tab"            => result.push_str("{TAB}"),
            "escape"|"esc"   => result.push_str("{ESC}"),
            "backspace"      => result.push_str("{BACKSPACE}"),
            "delete"         => result.push_str("{DELETE}"),
            "left"           => result.push_str("{LEFT}"),
            "right"          => result.push_str("{RIGHT}"),
            "up"             => result.push_str("{UP}"),
            "down"           => result.push_str("{DOWN}"),
            "space"          => result.push_str("{SPACE}"),
            s if s.len() == 1 => result.push_str(s),
            other            => result.push_str(&format!("{{{}}}", other.to_ascii_uppercase())),
        }
    }
    Ok(result)
}

// ─── Clipboard write ──────────────────────────────────────────────────────────

#[allow(dead_code)]
#[tauri::command]
pub fn clipboard_write_capture(text: String) -> Result<(), String> {
    // Use Set-Clipboard (PowerShell 5+, always available on Windows 10/11)
    ps_run(&format!(
        "Set-Clipboard -Value '{}'",
        text.replace('\'', "''")
    ))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scale_at_1280x720_is_one() {
        let s = compute_scale(1280, 720);
        assert!((s - 1.0).abs() < 0.01);
    }

    #[test]
    fn scale_4k_fits_spec() {
        let s = compute_scale(3840, 2160);
        let w = (3840.0 * s) as u32;
        let h = (2160.0 * s) as u32;
        assert!(w.max(h) <= 1568, "long edge {}", w.max(h));
        assert!((w * h) <= 1_150_000, "total pixels {}", w * h);
    }

    #[test]
    fn key_to_sendkeys_ctrl_c() {
        let s = key_to_sendkeys("ctrl+c").unwrap();
        assert_eq!(s, "^c");
    }

    #[test]
    fn key_to_sendkeys_enter() {
        let s = key_to_sendkeys("Return").unwrap();
        assert_eq!(s, "{ENTER}");
    }

    // Mirrors the `type` action's inline escaping — keep in sync.
    fn escape_sendkeys(text: &str) -> String {
        let mut escaped = String::with_capacity(text.len());
        for c in text.chars() {
            match c {
                '{' => escaped.push_str("{{}"),
                '}' => escaped.push_str("{}}"),
                '(' => escaped.push_str("{(}"),
                ')' => escaped.push_str("{)}"),
                '[' => escaped.push_str("{[}"),
                ']' => escaped.push_str("{]}"),
                '+' => escaped.push_str("{+}"),
                '^' => escaped.push_str("{^}"),
                '%' => escaped.push_str("{%}"),
                '~' => escaped.push_str("{~}"),
                _   => escaped.push(c),
            }
        }
        escaped
    }

    #[test]
    fn sendkeys_escaping_single_pass_is_correct() {
        assert_eq!(escape_sendkeys("{"), "{{}");
        assert_eq!(escape_sendkeys("}"), "{}}");
        assert_eq!(escape_sendkeys("{}"), "{{}{}}");
        assert_eq!(escape_sendkeys("a+b"), "a{+}b");
        assert_eq!(escape_sendkeys("(x)"), "{(}x{)}");
        assert_eq!(escape_sendkeys("plain text"), "plain text");
    }
}
