import fetch from "node-fetch";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { logJsonRpc } from './log.js';

// Cliente HTTP para MCP remoto
export class MCPHttpClient {
  constructor(url) {
    this.url = url;
    this.id = 1;
  }

  async callTool(name, args = {}) {
    try {
      // Para herramientas específicas, usar el nombre directamente
      // Para tools/call, extraer el nombre real de los parámetros
      let methodName = name;
      let methodParams = args;
      
      if (name === "tools/call" && args.name) {
        methodName = args.name;
        methodParams = args.arguments || {};
      }
      
      const payload = {
        method: methodName,
        params: methodParams
      };
      
      // Log del request JSON-RPC
      logJsonRpc("REQUEST", "RemoteMCP", payload);
      
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeout: 15000 // 15 segundos de timeout
      });
      
      if (res.status === 429) {
        throw new Error("Rate limit alcanzado");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const result = await res.json();
      
      // Log del response JSON-RPC
      logJsonRpc("RESPONSE", "RemoteMCP", result);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      if (error.message.includes('Rate limit') || error.message.includes('429')) {
        throw new Error("Rate limit alcanzado");
      }
      throw error;
    }
  }

  async listTools() {
    try {
      // Para servidores remotos HTTP, usar tools/list directamente
      const payload = {
        method: "tools/list",
        params: {}
      };
      
      logJsonRpc("REQUEST", "RemoteMCP", payload);
      
      const res = await fetch(this.url, {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      
      logJsonRpc("RESPONSE", "RemoteMCP", result);
      
      if (result && result.tools) {
        return result;
      }
    } catch (error) {
      console.log(`[DEBUG] Error al obtener tools del servidor remoto: ${error.message}`);
    }
    
    // Fallback con las tools conocidas del servidor remoto
    return {
      tools: [
        { name: "get_time", description: "Get current time in UTC or specified timezone" },
        { name: "lucky_number", description: "Get a random lucky number between 1 and 100" },
        { name: "fun_fact", description: "Get a random fun fact" },
        { name: "taylor_lyric", description: "Get a random Taylor Swift lyric and song title" }
      ]
    };
  }

  close() {}
}

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
        
        // Log del response JSON-RPC
        logJsonRpc("RESPONSE", "STDIO-MCP", msg);
        
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      }
    });

    this.proc.stderr.on("data", (data) => {
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
      
      // Log del request JSON-RPC
      logJsonRpc("REQUEST", "STDIO-MCP", payload);
      
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  async initialize() {
    if (this.initialized) return;
    await this._send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: "chatbot-mcp", version: "0.1.0" }
    });
    // Enviar notificación de inicializado
    this.proc.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    }) + "\n");
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    return this._send("tools/list", {});
  }

  async callTool(name, args = {}) {
    try {
      await this.initialize();
      return await this._send("tools/call", { name, arguments: args });
    } catch (error) {
      // Reintentar inicialización si falla
      if (!this.initialized) {
        try {
          this.initialized = false;
          await this.initialize();
          return await this._send("tools/call", { name, arguments: args });
        } catch (retryError) {
          throw retryError;
        }
      }
      throw error;
    }
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
  if (serverConfig.type === "http" && serverConfig.url) {
    return new MCPHttpClient(serverConfig.url);
  } else {
    const shellOption = await detectShellOption();
    return new MCPStdioClient(
      serverConfig.command,
      serverConfig.args || [],
      serverConfig.cwd ? { cwd: serverConfig.cwd } : {},
      shellOption
    );
  }
}
