import React, { useEffect, useMemo, useState } from "react"
import ReactDOM from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"
import {
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Code2,
  Download,
  KeyRound,
  Loader2,
  Network,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Terminal,
} from "lucide-react"
import "./styles.css"

type CliID = "claude" | "gemini" | "codex"

type CliStatus = {
  id: CliID
  installed: boolean
  version?: string | null
  command: string
}

type CommandResult = {
  success: boolean
  code?: number | null
  stdout: string
  stderr: string
}

type SetupDiagnostics = {
  node: CommandResult
  npm: CommandResult
  npm_registry: CommandResult
  npm_proxy: CommandResult
  npm_https_proxy: CommandResult
  npm_reachable: CommandResult
  claude_auth_reachable: CommandResult
  gemini_auth_reachable: CommandResult
  openai_auth_reachable: CommandResult
}

type NpmSettings = {
  registry: string
  proxy: string
}

type CliDefinition = {
  id: CliID
  name: string
  vendor: string
  summary: string
  packageName: string
  loginLabel: string
  accent: string
}

const clis: CliDefinition[] = [
  {
    id: "claude",
    name: "Claude Code",
    vendor: "Anthropic",
    summary: "Runs the official Claude Code browser login flow or setup-token helper.",
    packageName: "@anthropic-ai/claude-code",
    loginLabel: "Open Claude Login",
    accent: "#b96836",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    vendor: "Google",
    summary: "Starts the official Gemini CLI authentication picker for Google, API key, or Vertex AI.",
    packageName: "@google/gemini-cli",
    loginLabel: "Open Gemini Login",
    accent: "#1f7a5c",
  },
  {
    id: "codex",
    name: "Codex CLI",
    vendor: "OpenAI",
    summary: "Launches the official Codex Sign in with ChatGPT flow.",
    packageName: "@openai/codex",
    loginLabel: "Open Codex Login",
    accent: "#2563eb",
  },
]

function App() {
  const [active, setActive] = useState<CliID | "dashboard" | "setup" | "opencode">("dashboard")
  const [statuses, setStatuses] = useState<Record<CliID, CliStatus | undefined>>({
    claude: undefined,
    gemini: undefined,
    codex: undefined,
  })
  const [busy, setBusy] = useState<string | undefined>()
  const [logs, setLogs] = useState<string[]>([])
  const [diagnostics, setDiagnostics] = useState<SetupDiagnostics | undefined>()
  const [npmSettings, setNpmSettings] = useState<NpmSettings>({ registry: "", proxy: "" })

  const installedCount = useMemo(
    () => clis.filter((item) => statuses[item.id]?.installed).length,
    [statuses],
  )

  async function refresh() {
    setBusy("refresh")
    try {
      const result = await invoke<CliStatus[]>("list_cli_status")
      setStatuses(Object.fromEntries(result.map((item) => [item.id, item])) as Record<CliID, CliStatus>)
      addLog("Refreshed CLI status.")
    } catch (error) {
      addLog(`Status refresh failed: ${String(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  function addLog(line: string) {
    setLogs((current) => [`${new Date().toLocaleTimeString()}  ${line}`, ...current].slice(0, 80))
  }

  async function runAction(label: string, action: () => Promise<unknown>) {
    setBusy(label)
    try {
      const result = await action()
      if (isCommandResult(result)) {
        addLog(`${label}: ${result.success ? "success" : "failed"}`)
        if (result.stdout) addLog(result.stdout)
        if (result.stderr) addLog(result.stderr)
      } else {
        addLog(`${label}: opened PowerShell window.`)
      }
      await refresh()
    } catch (error) {
      addLog(`${label}: ${String(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  async function runDiagnostics() {
    setBusy("diagnostics")
    try {
      const result = await invoke<SetupDiagnostics>("setup_diagnostics")
      setDiagnostics(result)
      if (!npmSettings.registry && result.npm_registry.stdout && result.npm_registry.stdout !== "undefined") {
        setNpmSettings((current) => ({ ...current, registry: result.npm_registry.stdout }))
      }
      addLog("Completed setup diagnostics.")
    } catch (error) {
      addLog(`Setup diagnostics failed: ${String(error)}`)
    } finally {
      setBusy(undefined)
    }
  }

  useEffect(() => {
    void refresh()
    void runDiagnostics()
  }, [])

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon">
            <ShieldCheck size={22} />
          </div>
          <div>
            <strong>AI CLI Auth</strong>
            <span>Windows manager</span>
          </div>
        </div>

        <nav>
          <button className={active === "dashboard" ? "active" : ""} onClick={() => setActive("dashboard")}>
            <Boxes size={18} />
            Dashboard
          </button>
          <button className={active === "setup" ? "active" : ""} onClick={() => setActive("setup")}>
            <Network size={18} />
            Setup Check
          </button>
          {clis.map((item) => (
            <button className={active === item.id ? "active" : ""} key={item.id} onClick={() => setActive(item.id)}>
              <Terminal size={18} />
              {item.name}
            </button>
          ))}
          <button className={active === "opencode" ? "active" : ""} onClick={() => setActive("opencode")}>
            <Settings size={18} />
            opencode Config
          </button>
        </nav>

        <div className="sidebarFooter">
          <span>{installedCount}/3 installed</span>
          <button className="iconButton" disabled={busy === "refresh"} onClick={refresh} title="Refresh status">
            {busy === "refresh" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
          </button>
        </div>
      </aside>

      <section className="content">
        {active === "dashboard" && (
          <Dashboard
            statuses={statuses}
            diagnostics={diagnostics}
            npmSettings={npmSettings}
            busy={busy}
            runAction={runAction}
            logs={logs}
          />
        )}
        {active === "setup" && (
          <SetupPanel
            diagnostics={diagnostics}
            npmSettings={npmSettings}
            setNpmSettings={setNpmSettings}
            busy={busy}
            runDiagnostics={runDiagnostics}
            runAction={runAction}
          />
        )}
        {active !== "dashboard" && active !== "setup" && active !== "opencode" && (
          <CliPanel
            cli={clis.find((item) => item.id === active)!}
            status={statuses[active]}
            npmSettings={npmSettings}
            busy={busy}
            runAction={runAction}
          />
        )}
        {active === "opencode" && <OpencodePanel busy={busy} runAction={runAction} />}
      </section>
    </main>
  )
}

function Dashboard(props: {
  statuses: Record<CliID, CliStatus | undefined>
  diagnostics?: SetupDiagnostics
  npmSettings: NpmSettings
  busy?: string
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>
  logs: string[]
}) {
  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Official CLI authentication</p>
          <h1>Manage Claude, Gemini, and Codex sign-in from one Windows app.</h1>
        </div>
      </header>

      <div className="grid">
        {clis.map((cli) => (
          <CliCard
            key={cli.id}
            cli={cli}
            status={props.statuses[cli.id]}
            npmSettings={props.npmSettings}
            busy={props.busy}
            runAction={props.runAction}
          />
        ))}
      </div>

      <section className="setupSummary">
        <CheckItem label="Node.js" result={props.diagnostics?.node} />
        <CheckItem label="npm" result={props.diagnostics?.npm} />
        <CheckItem label="npm registry" result={props.diagnostics?.npm_reachable} />
        <CheckItem label="OAuth pages" result={mergeReachability(props.diagnostics)} />
      </section>

      <section className="logPanel">
        <div className="sectionTitle">
          <Terminal size={18} />
          Activity
        </div>
        <div className="logs">
          {props.logs.length === 0 ? <span className="muted">No activity yet.</span> : props.logs.map((line) => <p key={line}>{line}</p>)}
        </div>
      </section>
    </>
  )
}

function CliCard(props: {
  cli: CliDefinition
  status?: CliStatus
  npmSettings: NpmSettings
  busy?: string
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <article className="cliCard" style={{ "--accent": props.cli.accent } as React.CSSProperties}>
      <div className="cardTop">
        <div>
          <span className="vendor">{props.cli.vendor}</span>
          <h2>{props.cli.name}</h2>
        </div>
        <StatusPill status={props.status} />
      </div>
      <p>{props.cli.summary}</p>
      <div className="metaLine">
        <Code2 size={15} />
        {props.status?.version ?? props.cli.packageName}
      </div>
      <div className="actions">
        <ActionButton
          icon={<Download size={17} />}
          label="Install"
          disabled={props.busy !== undefined}
          onClick={() =>
            props.runAction(`Install ${props.cli.name}`, () =>
              invoke("install_cli", { request: { id: props.cli.id, ...props.npmSettings } }),
            )
          }
        />
        <ActionButton
          icon={<KeyRound size={17} />}
          label="Login"
          disabled={!props.status?.installed || props.busy !== undefined}
          onClick={() => props.runAction(`Login ${props.cli.name}`, () => invoke("login_cli", { request: { id: props.cli.id } }))}
        />
        <ActionButton
          icon={<Play size={17} />}
          label="Test"
          disabled={!props.status?.installed || props.busy !== undefined}
          onClick={() => props.runAction(`Test ${props.cli.name}`, () => invoke("test_cli", { request: { id: props.cli.id } }))}
        />
      </div>
    </article>
  )
}

function CliPanel(props: {
  cli: CliDefinition
  status?: CliStatus
  npmSettings: NpmSettings
  busy?: string
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <>
      <header className="pageHeader compact">
        <div>
          <p className="eyebrow">{props.cli.vendor}</p>
          <h1>{props.cli.name}</h1>
        </div>
        <StatusPill status={props.status} />
      </header>

      <section className="detailPanel" style={{ "--accent": props.cli.accent } as React.CSSProperties}>
        <div className="detailRow">
          <span>Command</span>
          <strong>{props.status?.command ?? props.cli.id}</strong>
        </div>
        <div className="detailRow">
          <span>Package</span>
          <strong>{props.cli.packageName}</strong>
        </div>
        <div className="detailRow">
          <span>Detected version</span>
          <strong>{props.status?.version ?? "Not detected"}</strong>
        </div>
        <div className="buttonStrip">
          <ActionButton
          icon={<Download size={17} />}
          label="Install CLI"
          disabled={props.busy !== undefined}
            onClick={() =>
              props.runAction(`Install ${props.cli.name}`, () =>
                invoke("install_cli", { request: { id: props.cli.id, ...props.npmSettings } }),
              )
            }
          />
          <ActionButton
            icon={<KeyRound size={17} />}
            label={props.cli.loginLabel}
            disabled={!props.status?.installed || props.busy !== undefined}
            onClick={() => props.runAction(`Login ${props.cli.name}`, () => invoke("login_cli", { request: { id: props.cli.id } }))}
          />
          <ActionButton
            icon={<Play size={17} />}
            label="Run Version Test"
            disabled={!props.status?.installed || props.busy !== undefined}
            onClick={() => props.runAction(`Test ${props.cli.name}`, () => invoke("test_cli", { request: { id: props.cli.id } }))}
          />
        </div>
      </section>

      {props.cli.id === "claude" && (
        <section className="notePanel">
          <div>
            <h3>Claude CI token helper</h3>
            <p>Use this only when you need Claude Code's official long-lived token flow for scripts or CI.</p>
          </div>
          <ActionButton
            icon={<KeyRound size={17} />}
            label="Open setup-token"
            disabled={!props.status?.installed || props.busy !== undefined}
            onClick={() => props.runAction("Claude setup-token", () => invoke("open_claude_token_setup"))}
          />
        </section>
      )}
    </>
  )
}

function SetupPanel(props: {
  diagnostics?: SetupDiagnostics
  npmSettings: NpmSettings
  setNpmSettings: React.Dispatch<React.SetStateAction<NpmSettings>>
  busy?: string
  runDiagnostics: () => Promise<void>
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <>
      <header className="pageHeader compact">
        <div>
          <p className="eyebrow">Portability</p>
          <h1>Prepare a different Windows laptop and network.</h1>
        </div>
        <ActionButton
          icon={props.busy === "diagnostics" ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
          label="Run checks"
          disabled={props.busy !== undefined}
          onClick={props.runDiagnostics}
        />
      </header>

      <section className="detailPanel">
        <div className="sectionTitle">
          <Network size={18} />
          Runtime and network checks
        </div>
        <CheckItem label="Node.js on PATH" result={props.diagnostics?.node} />
        <CheckItem label="npm on PATH" result={props.diagnostics?.npm} />
        <CheckItem label="npm registry reachable" result={props.diagnostics?.npm_reachable} />
        <CheckItem label="Claude login page reachable" result={props.diagnostics?.claude_auth_reachable} />
        <CheckItem label="Google login page reachable" result={props.diagnostics?.gemini_auth_reachable} />
        <CheckItem label="OpenAI login page reachable" result={props.diagnostics?.openai_auth_reachable} />
      </section>

      <section className="detailPanel">
        <div className="sectionTitle">
          <Settings size={18} />
          npm install options
        </div>
        <label className="field">
          <span>Registry</span>
          <input
            value={props.npmSettings.registry}
            placeholder="https://registry.npmjs.org/"
            onChange={(event) => props.setNpmSettings((current) => ({ ...current, registry: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Proxy</span>
          <input
            value={props.npmSettings.proxy}
            placeholder="http://user:pass@proxy.company.com:8080"
            onChange={(event) => props.setNpmSettings((current) => ({ ...current, proxy: event.target.value }))}
          />
        </label>
        <p className="wideText">
          These values are appended only to install commands. Leave them empty for normal home networks.
        </p>
        <div className="buttonStrip two">
          <ActionButton
            icon={<Download size={17} />}
            label="Open Node.js download"
            disabled={props.busy !== undefined}
            onClick={() => props.runAction("Open Node.js download", () => invoke("open_node_download"))}
          />
          <ActionButton
            icon={<Play size={17} />}
            label="Check npm registry value"
            disabled={props.busy !== undefined}
            onClick={props.runDiagnostics}
          />
        </div>
      </section>
    </>
  )
}

function OpencodePanel(props: {
  busy?: string
  runAction: (label: string, action: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <>
      <header className="pageHeader compact">
        <div>
          <p className="eyebrow">Optional</p>
          <h1>Generate opencode provider config.</h1>
        </div>
      </header>
      <section className="detailPanel">
        <p className="wideText">
          This writes a minimal user config under <strong>%USERPROFILE%\.config\opencode\opencode.json</strong>.
          It does not copy credentials from Claude, Gemini, or Codex.
        </p>
        <ActionButton
          icon={<Settings size={17} />}
          label="Create opencode config"
          disabled={props.busy !== undefined}
          onClick={() => props.runAction("Create opencode config", () => invoke("create_opencode_config"))}
        />
      </section>
    </>
  )
}

function StatusPill(props: { status?: CliStatus }) {
  if (!props.status) {
    return (
      <span className="pill neutral">
        <Loader2 className="spin" size={15} />
        Checking
      </span>
    )
  }
  if (props.status.installed) {
    return (
      <span className="pill ok">
        <CheckCircle2 size={15} />
        Installed
      </span>
    )
  }
  return (
    <span className="pill warn">
      <CircleAlert size={15} />
      Missing
    </span>
  )
}

function CheckItem(props: { label: string; result?: CommandResult }) {
  const pending = !props.result
  const ok = props.result?.success
  const detail = pending ? "Not checked" : props.result?.stdout || props.result?.stderr || "No output"
  return (
    <div className="checkItem">
      <span className={pending ? "checkIcon neutralCheck" : ok ? "checkIcon okCheck" : "checkIcon warnCheck"}>
        {pending ? <Loader2 className="spin" size={15} /> : ok ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
      </span>
      <div>
        <strong>{props.label}</strong>
        <small>{detail}</small>
      </div>
    </div>
  )
}

function mergeReachability(input?: SetupDiagnostics): CommandResult | undefined {
  if (!input) return undefined
  const success =
    input.claude_auth_reachable.success && input.gemini_auth_reachable.success && input.openai_auth_reachable.success
  return {
    success,
    code: success ? 0 : 1,
    stdout: success ? "Claude, Google, and OpenAI auth pages reachable" : "",
    stderr: success ? "" : "One or more auth pages are blocked",
  }
}

function ActionButton(props: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button className="actionButton" disabled={props.disabled} onClick={props.onClick}>
      {props.icon}
      {props.label}
      <ChevronRight size={16} />
    </button>
  )
}

function isCommandResult(value: unknown): value is CommandResult {
  return Boolean(value && typeof value === "object" && "success" in value && "stdout" in value && "stderr" in value)
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
