import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export class MCPStdioClient {
  constructor(command, args = [], options = {}, shellOption = true) {
    this.proc = spawn(command, args, { stdio: "pipe", shell: shellOption, ...options });
    this.id = 1;
    this.pending = new Map();
    this.buffer = "";
    this.initialized = false;

    this.proc.stdout.on("data", (data) => {
      this.buffer += data.toString();
      let idx;
      while ((idx = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 1);
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      }
    });

    // Silenciar STDERR de los MCPs para evitar spam en consola
    this.proc.stderr.on("data", (data) => {
      // Comentado para no imprimir nada:
      // console.error(`[${command}] STDERR:`, data.toString());
    });

    this.proc.on("exit", (code) => {
      console.log(`[INFO] MCP (${command}) finalizó con código ${code}`);
    });
    this.proc.on("error", (err) => {
      console.error(`[ERROR] MCP (${command}) error:`, err);
    });
  }

  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      const payload = { jsonrpc: "2.0", id, method, params };
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  async initialize() {
    if (this.initialized) return;
    await this._send("initialize", {
      protocolVersion: "2.0",
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: "chatbot-mcp", version: "0.1.0" }
    });
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    return this._send("tools/list", {});
  }

  async callTool(name, args = {}) {
    await this.initialize();
    return this._send("tools/call", { name, arguments: args });
  }

  close() { try { this.proc.kill(); } catch {} }
}

// Cargar servers.json
export function loadServersConfig(configPath = "config/servers.json") {
  const absPath = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);
  if (!fs.existsSync(absPath)) throw new Error("No se encontró el archivo de configuración: " + absPath);
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}

// Detectar shell seguro en Windows
export async function detectShellOption() {
  if (process.platform === 'win32') {
    const cmdPath = path.join(process.env.WINDIR || "C:\\Windows", "System32", "cmd.exe");
    const psPath = path.join(process.env.WINDIR || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    if (fs.existsSync(cmdPath)) {
      // shell: true usará cmd.exe por defecto en Windows
      return true;
    } else if (fs.existsSync(psPath)) {
      // shell: powershell.exe si existe
      return fs.existsSync(psPath) ? psPath : false;
    } else {
      // Ningún shell disponible, no usar shell
      return false;
    }
    return true; // fallback a shell predeterminado
  }
  return true; // Linux/macOS
}

// Crear cliente MCP
export async function createMCPClient(serverConfig) {
  const shellOption = await detectShellOption();
  return new MCPStdioClient(
    serverConfig.command,
    serverConfig.args || [],
    serverConfig.cwd ? { cwd: serverConfig.cwd } : {},
    shellOption
  );
}
