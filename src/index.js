import dotenv from "dotenv";
dotenv.config({ path: "./config/.env" });
import readline from "readline";
import { loadServersConfig, createMCPClient } from "./mcp_clients.js";
import { ClaudeClient } from "./claude.js";
import { logInteraction, showLog } from "./log.js";
import fs from "fs";
import { createGithubRepo, deleteGithubRepo } from "../config/github_api.js";
import { exec, execSync } from "child_process";
// Cargar tools de archivos JSON
let allTools = [];
try {
  allTools = JSON.parse(fs.readFileSync("config/all_tools.json", "utf8"));
} catch (e) {
  console.warn("[WARN] No se pudo cargar all_tools.json:", e);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const apiKey = process.env.CLAUDE_API_KEY;
const claude = new ClaudeClient(apiKey);

// Cargar servidores MCP
const servers = loadServersConfig("config/servers.json");
let clients = [];

async function main() {
  // Regenerar all_tools.json automáticamente al iniciar
  try {
    execSync("node scripts/generate_tools_json.js", { stdio: "ignore" });
  } catch (e) {
    console.warn("[WARN] No se pudo regenerar all_tools.json:", e);
  }
  // Mostrar solo los MCP detectados (nombre y comando)
  console.log("[INFO] MCPs detectados:");
  servers.forEach((cfg, i) => {
    const name = cfg.name || `MCP ${i+1}`;
    const cmd = [cfg.command, ...(cfg.args || [])].join(' ');
    console.log(`- ${name}: ${cmd}`);
  });
  // Inicializar MCP clients de forma segura
  const results = await Promise.allSettled(servers.map(cfg => createMCPClient(cfg)));
  clients = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  const history = [];

  rl.on("line", async (line) => {
    const input = line.trim();
    if (input.toLowerCase() === "exit") {
      rl.close();
      clients.forEach(c => c.close());
      process.exit(0);
    }
    if (input.toLowerCase() === "log" || input.toLowerCase() === "historial") {
      showLog();
      rl.prompt();
      return;
    }

    // FLUJO: detección de intención por tools
    const lowerInput = input.toLowerCase();
    const fsClient = clients.find(c => c.proc.spawnargs.some(a => String(a).includes("@modelcontextprotocol/server-filesystem")));
    const gitClient = clients.find(c => c.proc.spawnargs.some(a => String(a).includes("@cyanheads/git-mcp-server")));

    // Buscar tool más relevante
    let toolMatch = null;
    let toolArgs = {};
    for (const tool of allTools) {
      // Coincidencia por nombre o descripción
      if (lowerInput.includes(tool.name) || (tool.description && lowerInput.includes(tool.description.split(" ")[0]))) {
        toolMatch = tool;
        break;
      }
      // Coincidencia por argumentos y valores típicos
      if (tool.input_schema && tool.input_schema.properties) {
        for (const arg in tool.input_schema.properties) {
          // Si el input menciona el argumento o un valor típico
          if (lowerInput.includes(arg)) {
            toolMatch = tool;
            break;
          }
        }
      }
      if (toolMatch) break;
    }
    
    // Ejemplo: crear repo (GitHub + clonar)
    if (toolMatch && toolMatch.name === "create_repository") {
      // Extraer nombre del repo del input
      const repoName = lowerInput.split("repositorio").pop().replace(/[^\w-]/g, "").trim();
      if (!repoName) {
        const msg = `❌ No se pudo detectar el nombre del repositorio.`;
        console.log(`[Chatbot]: ${msg}`);
        logInteraction('assistant', msg);
        rl.prompt();
        return;
      }
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        const msg = `❌ No se encontró el token de GitHub en .env (GITHUB_TOKEN).`;
        console.log(`[Chatbot]: ${msg}`);
        logInteraction('assistant', msg);
        rl.prompt();
        return;
      }
      const cloneDir = `D:/Documentos/GitHub/${repoName}`;
      try {
        const repo = await createGithubRepo(repoName, githubToken);
        const cloneUrl = repo.clone_url;
        await new Promise((resolve, reject) => {
          exec(`git clone ${cloneUrl} "${cloneDir}"`, (err, stdout, stderr) => {
            if (err) return reject(stderr || err);
            resolve(stdout);
          });
        });
        const msg = `✅ Repositorio creado en GitHub y clonado en ${cloneDir}`;
        console.log(`[Chatbot]: ${msg}`);
        logInteraction('assistant', msg);
      } catch (err) {
        const msg = `❌ Error al crear/clonar el repositorio: ${err}`;
        console.log(`[Chatbot]: ${msg}`);
        logInteraction('assistant', msg);
      }
      rl.prompt();
      return;
    }

    // Ejemplo: eliminar repo (GitHub)
    if (lowerInput.match(/elimina(r)?( el)? repositorio/)) {
      // Extraer nombre del repo del input
      const repoName = lowerInput.split("repositorio").pop().replace(/[^\w-]/g, "").trim();
      if (!repoName) {
        const msg = `❌ No se pudo detectar el nombre del repositorio a eliminar.`;
        console.log(`[Chatbot]: ${msg}`);
        logInteraction('assistant', msg);
        rl.prompt();
        return;
      }
      const githubToken = process.env.GITHUB_TOKEN;
      const owner = process.env.GITHUB_OWNER || "paulabaal12";
      if (!githubToken) {
        const msg = `❌ No se encontró el token de GitHub en .env (GITHUB_TOKEN).`;
        console.log(`[Chatbot]: ${msg}`);
        logInteraction('assistant', msg);
        rl.prompt();
        return;
      }
      try {
        const result = await deleteGithubRepo(repoName, githubToken, owner);
        const msg = `✅ ${result.message}`;
        console.log(`[Chatbot]: ${msg}`);
        logInteraction('assistant', msg);
      } catch (err) {
        const msg = `❌ Error al eliminar el repositorio: ${err}`;
        console.log(`[Chatbot]: ${msg}`);
        logInteraction('assistant', msg);
      }
      rl.prompt();
      return;
    }

    // Ejemplo: escribir archivo
    if (toolMatch && toolMatch.name === "write_file") {
      // Buscar nombre de archivo y contenido en el input
      const fileMatch = lowerInput.match(/(\w+\.\w+)/);
      const fileName = fileMatch ? fileMatch[1] : "archivo.txt";
      const content = logInteraction.lastReceta || `Archivo generado automáticamente: ${fileName}`;
      if (fsClient) {
        await fsClient.callTool('write_file', { path: `./${fileName}`, content });
        console.log(`[Chatbot]: usando FilesystemMCP -> archivo creado ./${fileName}`);
        logInteraction('assistant', `El archivo **${fileName}** fue guardado ✅`);
      } else {
        console.log(`[Chatbot]: No se encontró FilesystemMCP.`);
      }
      rl.prompt();
      return;
    }

    // Ejemplo: git add/commit
    if (toolMatch && toolMatch.name === "git_add") {
      // Buscar repo y archivo
      const repoMatch = lowerInput.match(/d:[\\/][^\s]+/i);
      const fileMatch = lowerInput.match(/(\w+\.\w+)/);
      const repoPath = repoMatch ? repoMatch[0].replace(/\\/g, "/") : null;
      const fileName = fileMatch ? fileMatch[1] : null;
      if (gitClient && repoPath && fileName) {
        await gitClient.callTool('git_add', { path: repoPath, paths: [fileName] });
        await gitClient.callTool('git_commit', { path: repoPath, message: `add ${fileName}` });
        console.log(`[Chatbot]: usando GitMCP -> archivo agregado y commit hecho`);
        logInteraction('assistant', `El archivo **${fileName}** fue agregado y commiteado en el repo`);
      } else {
        console.log(`[Chatbot]: No se encontró GitMCP o faltan datos.`);
      }
      rl.prompt();
      return;
    }

    // Si hay toolMatch y toolArgs, invoca el tool MCP
    if (toolMatch) {
      // Buscar el cliente MCP adecuado usando el campo 'mcp' de all_tools.json
      const mcpName = toolMatch.mcp;
      const mcpIndex = servers.findIndex(cfg => (cfg.name || '').toLowerCase() === (mcpName || '').toLowerCase());
      const mcpClient = mcpIndex !== -1 ? clients[mcpIndex] : undefined;
      if (mcpClient) {
        try {
          console.log(`[Chatbot]: Analizando y consultando ${mcpName}...`);
          const result = await mcpClient.callTool(toolMatch.name, toolArgs);
          logInteraction('assistant', `[${mcpName}]:\n${JSON.stringify(result, null, 2)}`);
          // Pasa el resultado a Claude para interpretación
          const prompt = `Interpreta y embellece esta respuesta de un MCP para el usuario, en español, de forma natural:\n${JSON.stringify(result)}`;
          const response = await claude.sendMessage(prompt, history);
          history.push({ role: "user", content: input });
          history.push({ role: "assistant", content: response.content });
          logInteraction('user', input);
          logInteraction('assistant', response.content[0]?.text || "(sin respuesta)");
          console.log("[Claude]:", response.content[0]?.text || "(sin respuesta)");
        } catch (err) {
          const msg = `Error al invocar tool MCP: ${err}`;
          console.log(msg);
          logInteraction('assistant', msg);
        }
      } else {
        const msg = `[Chatbot]: No existe un tool MCP para esta acción.`;
        console.log(msg);
        logInteraction('assistant', msg);
      }
      rl.prompt();
      return;
    }

    // Interacción normal con Claude
    try {
      const response = await claude.sendMessage(input, history);
      history.push({ role: "user", content: input });
      history.push({ role: "assistant", content: response.content });
      logInteraction('user', input);
      logInteraction('assistant', response.content[0]?.text || "(sin respuesta)");
      console.log("[Claude]:", response.content[0]?.text || "(sin respuesta)");
      rl.prompt();
    } catch (err) {
      console.error("[Claude]: Error al comunicarse con Claude:", err);
      logInteraction('user', input);
      logInteraction('assistant', `Error al comunicarse con Claude: ${err}`);
      rl.prompt();
    }
  });
  rl.prompt();
}

main();
