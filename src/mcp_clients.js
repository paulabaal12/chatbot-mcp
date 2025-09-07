import { spawn } from 'child_process';

export class MCPStdioClient {
  constructor(command, args = [], options = {}) {
  this.proc = spawn(command, args, { stdio: 'pipe', shell: true, ...options });
    this.id = 1;
    this.pending = new Map();
    this.buffer = '';
    this.initialized = false;

    this.proc.stdout.on('data', (data) => {
      this.buffer += data.toString();
      let idx;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
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
    this.proc.stderr.on('data', () => { /* opcional: loggear */ });
  }

  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      const payload = { jsonrpc: '2.0', id, method, params };
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  async initialize() {
    if (this.initialized) return;
    await this._send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {}, resources: {}, prompts: {} },
      clientInfo: { name: 'chatbot-mcp', version: '0.1.0' }
    });
    this.initialized = true;
  }

  async listTools() {
    await this.initialize();
    return this._send('tools/list', {});
  }

  async callTool(name, args = {}) {
    await this.initialize();
    return this._send('tools/call', { name, arguments: args });
  }

  close() { try { this.proc.kill(); } catch {} }
}
