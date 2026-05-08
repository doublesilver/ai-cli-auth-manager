#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
struct CliStatus {
    id: String,
    installed: bool,
    version: Option<String>,
    command: String,
}

#[derive(Debug, Clone, Serialize)]
struct CommandResult {
    success: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CliRequest {
    id: String,
    registry: Option<String>,
    proxy: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct SetupDiagnostics {
    node: CommandResult,
    npm: CommandResult,
    npm_registry: CommandResult,
    npm_proxy: CommandResult,
    npm_https_proxy: CommandResult,
    npm_reachable: CommandResult,
    claude_auth_reachable: CommandResult,
    gemini_auth_reachable: CommandResult,
    openai_auth_reachable: CommandResult,
}

#[derive(Debug, Clone)]
struct CliDefinition {
    id: &'static str,
    command: &'static str,
    install_package: &'static str,
    login_args: &'static [&'static str],
    test_args: &'static [&'static str],
}

const CLIS: &[CliDefinition] = &[
    CliDefinition {
        id: "claude",
        command: "claude",
        install_package: "@anthropic-ai/claude-code",
        login_args: &[],
        test_args: &["--version"],
    },
    CliDefinition {
        id: "gemini",
        command: "gemini",
        install_package: "@google/gemini-cli",
        login_args: &[],
        test_args: &["--version"],
    },
    CliDefinition {
        id: "codex",
        command: "codex",
        install_package: "@openai/codex",
        login_args: &["--login"],
        test_args: &["--version"],
    },
];

fn cli_definition(id: &str) -> Result<&'static CliDefinition, String> {
    CLIS
        .iter()
        .find(|item| item.id == id)
        .ok_or_else(|| format!("Unknown CLI id: {id}"))
}

fn run_capture(program: &str, args: &[&str]) -> CommandResult {
    match Command::new(program).args(args).output() {
        Ok(output) => CommandResult {
            success: output.status.success(),
            code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        },
        Err(error) => CommandResult {
            success: false,
            code: None,
            stdout: String::new(),
            stderr: error.to_string(),
        },
    }
}

fn command_exists(command: &str) -> bool {
    run_capture("where.exe", &[command]).success
}

fn open_powershell(title: &str, command: &str) -> Result<(), String> {
    let script = format!(
        "$host.UI.RawUI.WindowTitle = '{}'; {}; Write-Host ''; Write-Host 'Press Enter to close this window...'; Read-Host",
        title.replace('\'', "''"),
        command
    );

    Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn optional_npm_args(request: &CliRequest) -> String {
    let mut args = Vec::new();
    if let Some(registry) = request.registry.as_ref().filter(|value| !value.trim().is_empty()) {
        args.push(format!("--registry {}", powershell_quote(registry)));
    }
    if let Some(proxy) = request.proxy.as_ref().filter(|value| !value.trim().is_empty()) {
        let quoted = powershell_quote(proxy);
        args.push(format!("--proxy {quoted} --https-proxy {quoted}"));
    }
    args.join(" ")
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn test_url(url: &str) -> CommandResult {
    let script = format!(
        "try {{ $r = Invoke-WebRequest -UseBasicParsing -Method Head -TimeoutSec 12 {}; Write-Output $r.StatusCode; exit 0 }} catch {{ Write-Error $_.Exception.Message; exit 1 }}",
        powershell_quote(url)
    );
    run_capture(
        "powershell.exe",
        &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script],
    )
}

#[tauri::command]
fn list_cli_status() -> Vec<CliStatus> {
    CLIS
        .iter()
        .map(|item| {
            let installed = command_exists(item.command);
            let version = if installed {
                let result = run_capture(item.command, &["--version"]);
                let text = if result.stdout.is_empty() {
                    result.stderr
                } else {
                    result.stdout
                };
                if text.is_empty() {
                    None
                } else {
                    Some(text.lines().next().unwrap_or("").to_string())
                }
            } else {
                None
            };

            CliStatus {
                id: item.id.to_string(),
                installed,
                version,
                command: item.command.to_string(),
            }
        })
        .collect()
}

#[tauri::command]
fn install_cli(request: CliRequest) -> Result<(), String> {
    let cli = cli_definition(&request.id)?;
    let npm_args = optional_npm_args(&request);
    let suffix = if npm_args.is_empty() {
        String::new()
    } else {
        format!(" {npm_args}")
    };
    open_powershell(
        &format!("Install {}", cli.command),
        &format!("npm install -g {}{}", cli.install_package, suffix),
    )
}

#[tauri::command]
fn login_cli(request: CliRequest) -> Result<(), String> {
    let cli = cli_definition(&request.id)?;
    let args = if cli.login_args.is_empty() {
        String::new()
    } else {
        format!(" {}", cli.login_args.join(" "))
    };
    open_powershell(
        &format!("Login {}", cli.command),
        &format!("{}{}", cli.command, args),
    )
}

#[tauri::command]
fn test_cli(request: CliRequest) -> Result<CommandResult, String> {
    let cli = cli_definition(&request.id)?;
    Ok(run_capture(cli.command, cli.test_args))
}

#[tauri::command]
fn open_claude_token_setup() -> Result<(), String> {
    open_powershell("Claude setup-token", "claude setup-token")
}

#[tauri::command]
fn create_opencode_config() -> Result<CommandResult, String> {
    let script = r#"
$dir = Join-Path $HOME '.config\opencode'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$path = Join-Path $dir 'opencode.json'
$json = @'
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {},
    "google": {},
    "openai": {}
  }
}
'@
Set-Content -Path $path -Value $json -Encoding UTF8
Write-Output $path
"#;

    Ok(run_capture(
        "powershell.exe",
        &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    ))
}

#[tauri::command]
fn setup_diagnostics() -> SetupDiagnostics {
    SetupDiagnostics {
        node: run_capture("node", &["--version"]),
        npm: run_capture("npm", &["--version"]),
        npm_registry: run_capture("npm", &["config", "get", "registry"]),
        npm_proxy: run_capture("npm", &["config", "get", "proxy"]),
        npm_https_proxy: run_capture("npm", &["config", "get", "https-proxy"]),
        npm_reachable: test_url("https://registry.npmjs.org/"),
        claude_auth_reachable: test_url("https://claude.ai/"),
        gemini_auth_reachable: test_url("https://accounts.google.com/"),
        openai_auth_reachable: test_url("https://auth.openai.com/"),
    }
}

#[tauri::command]
fn open_node_download() -> Result<(), String> {
    open_powershell(
        "Install Node.js",
        "Start-Process 'https://nodejs.org/en/download'",
    )
}

#[tauri::command]
fn open_windows_build_folder() -> Result<(), String> {
    open_powershell(
        "Build folder",
        "Start-Process (Resolve-Path '.\\src-tauri\\target\\release\\bundle' -ErrorAction SilentlyContinue)",
    )
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_cli_status,
            install_cli,
            login_cli,
            test_cli,
            open_claude_token_setup,
            create_opencode_config,
            setup_diagnostics,
            open_node_download,
            open_windows_build_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
