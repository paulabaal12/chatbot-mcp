import dotenv from "dotenv";
dotenv.config({ path: "./config/.env" });
import readline from "readline";
import { loadServersConfig, createMCPClient } from "./mcp_clients.js";
import { ClaudeClient } from "./claude.js";
import { logInteraction, showLog } from "./log.js";
import { findToolForQuery } from "./dynamic_query_mapper.js";
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
let mcpRateLimits = new Map(); // Rastrear rate limits por MCP

async function main() {
  // Regenerar all_tools.json automáticamente al iniciar
  try {
    execSync("node scripts/generate_tools_json.js", { stdio: "ignore" });
  } catch (e) {
    // Silent fail - not critical
  }

  // Mostrar resumen de MCPs disponibles
  console.log("🤖 Chatbot MCP con Sistema Dinámico");
  const mcpToolCounts = servers.map(cfg => {
    const name = cfg.name || "";
    return allTools.filter(t => (t.mcp || "").toLowerCase() === name.toLowerCase()).length;
  });
  const totalTools = mcpToolCounts.reduce((sum, count) => sum + count, 0);
  console.log(`📦 ${servers.length} MCPs cargados con ${totalTools} herramientas disponibles`);
  console.log("✨ Sistema completamente dinámico activado\n");
  
  // Mostrar detalle de MCPs disponibles
  console.log("MCPs disponibles:");
  servers.forEach((cfg, i) => {
    const name = cfg.name || `MCP ${i+1}`;
    const count = mcpToolCounts[i];
    console.log(`• ${name}: ${count} tools`);
  });
  console.log(""); // Línea en blanco

  // Inicializar MCP clients de forma segura con reintentos
  const results = await Promise.allSettled(servers.map(cfg => createMCPClient(cfg)));
  clients = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  // Función para reconectar MCPs si es necesario
  async function reconnectMCP(index) {
    try {
      const newClient = await createMCPClient(servers[index]);
      clients[index] = newClient;
      console.log(`[INFO] Reconectado MCP: ${servers[index].name}`);
      return true;
    } catch (error) {
      console.error(`[ERROR] No se pudo reconectar MCP ${servers[index].name}:`, error);
      return false;
    }
  }

  // Función auxiliar para ejecutar herramientas MCP
  async function executeMCPTool(mcpClient, mcpName, mcpIndex, toolName, toolArgs, userInput) {
    try {
      // Mostrar indicador de ejecución en consola
      console.log(`[Chatbot]: Ejecutando tool ${toolName} en ${mcpName}...`);
      
      // Log detallado solo a session.log
      logInteraction('system', `Ejecutando tool ${toolName} en ${mcpName}...`);
      let result;
      
      try {
        result = await mcpClient.callTool(toolName, toolArgs);
        logInteraction('system', `Resultado del MCP: ${JSON.stringify(result, null, 2)}`);
      } catch (toolError) {
        // Intentar reconectar si el MCP falló
        if (toolError.message && toolError.message.includes('Rate limit')) {
          throw toolError; // No reconectar por rate limit
        }
        
        logInteraction('system', `Intentando reconectar ${mcpName}...`);
        const reconnected = await reconnectMCP(mcpIndex);
        if (reconnected) {
          result = await clients[mcpIndex].callTool(toolName, toolArgs);
          logInteraction('system', `Resultado del MCP (reconectado): ${JSON.stringify(result, null, 2)}`);
        } else {
          throw toolError;
        }
      }

      // Automatización Git: flujo completo para operaciones Git
      let autoMsg = "";
      
      // Automatización tras git_commit
      if (toolName === "git_commit") {
        // 1. Configurar directorio de trabajo
        let repoPath = null;
        const repoPhrase = "en D:/Documentos/GitHub/";
        let idx = userInput.indexOf(repoPhrase);
        if (idx !== -1) {
          let start = idx + repoPhrase.length;
          let end = start;
          while (end < userInput.length && (userInput[end].match(/[a-zA-Z0-9_-]/))) {
            end++;
          }
          repoPath = `D:/Documentos/GitHub/${userInput.slice(start, end)}`;
        }
        
        if (repoPath) {
          try {
            await mcpClient.callTool("git_set_working_dir", { path: repoPath });
            autoMsg += `\n📁 Directorio configurado: ${repoPath}`;
            logInteraction('system', `git_set_working_dir configurado en ${repoPath}`);
            
            // 2. Hacer git_add antes del commit
            await mcpClient.callTool("git_add", {});
            autoMsg += `\n➕ Archivos agregados al staging area`;
            logInteraction('system', `git_add ejecutado automáticamente`);
            
            // 3. Volver a intentar el commit
            result = await mcpClient.callTool(toolName, toolArgs);
            autoMsg += `\n✅ Commit realizado correctamente`;
            logInteraction('system', `git_commit completado exitosamente`);
            
          } catch (autoError) {
            autoMsg += `\n⚠️ Error en automatización: ${autoError.message}`;
            logInteraction('system', `Error en automatización Git: ${autoError.message}`);
          }
        }
      }
      
      // Automatización tras crear repositorio en GitHub
      if (toolName === "github_create_repo") {
        if (result?.full_name) {
          const repoName = result.full_name.split("/")[1];
          const destPath = `D:/Documentos/GitHub/${repoName}`;
          try {
            // Buscar GitMCP para clonar
            const gitMcpIndex = servers.findIndex(cfg => (cfg.name || '').toLowerCase() === 'gitmcp');
            const gitMcpClient = gitMcpIndex !== -1 ? clients[gitMcpIndex] : undefined;
            if (gitMcpClient) {
              await gitMcpClient.callTool("git_clone", { 
                repositoryUrl: result.clone_url, 
                targetPath: destPath 
              });
              autoMsg += `\n🔄 Repositorio clonado en ${destPath}`;
              
              await gitMcpClient.callTool("git_set_working_dir", { path: destPath });
              autoMsg += `\n📁 Directorio de trabajo configurado`;
              logInteraction('system', `Repositorio ${repoName} clonado y configurado automáticamente`);
            }
          } catch (autoError) {
            autoMsg += `\n⚠️ Error al clonar: ${autoError.message}`;
            logInteraction('system', `Error en clonación automática: ${autoError.message}`);
          }
        }
      }

      logInteraction('assistant', `[${mcpName}]:\n${JSON.stringify(result, null, 2)}`);
      
      // Preparar resultado para interpretación
      let resultForPrompt = result;
      let showError = result?.isError === true;
      if (autoMsg && typeof result === 'object' && !Array.isArray(result)) {
        resultForPrompt = { ...result, _autoMsg: autoMsg };
        if (/Commit realizado correctamente/i.test(autoMsg) && /push.*(realizado correctamente|resultado de push)/i.test(autoMsg)) {
          showError = false;
        }
      }
      
      // Usar el nuevo método especializado de Claude
      let response;
      if (showError) {
        const prompt = `Interpreta esta respuesta de error de un MCP para el usuario\n${JSON.stringify(resultForPrompt)}${autoMsg}`;
        response = await claude.sendMessage(prompt, history, 1000);
      } else {
        response = await claude.interpretMCPResponse(toolName, mcpName, resultForPrompt, userInput);
      }
      
      history.push({ role: "user", content: userInput });
      history.push({ role: "assistant", content: response.content });
      logInteraction('user', userInput);
      logInteraction('assistant', response.content[0]?.text || "(sin respuesta)");
      
      // Mostrar en consola con formato limpio
      console.log(`[Claude + ${mcpName}]: ${response.content[0]?.text || "(sin respuesta)"}`);
      
    } catch (err) {
      let msg;
      if (err.message && err.message.includes('Rate limit')) {
        msg = handleRateLimit(mcpName);
      } else {
        // Mejorar el manejo de errores para mostrar información útil
        const errorDetails = err.message || err.toString() || 'Error desconocido';
        msg = `Error al invocar tool MCP: ${errorDetails}`;
        
        // Log detallado del error
        logInteraction('system', `Error completo: ${JSON.stringify(err, null, 2)}`);
      }
      console.log(`[Error]: ${msg}`);
      logInteraction('assistant', msg);
    }
    rl.prompt();
  }

  const history = [];

  // Función para verificar rate limit
  function checkRateLimit(mcpName) {
    const now = Date.now();
    const lastCall = mcpRateLimits.get(mcpName);
    if (lastCall && (now - lastCall) < 500) { // 500ms entre llamadas (más usable)
      return false;
    }
    mcpRateLimits.set(mcpName, now);
    return true;
  }

  // Función para manejar errores de rate limit
  function handleRateLimit(mcpName) {
    const lastCall = mcpRateLimits.get(mcpName);
    const waitTime = lastCall ? Math.ceil((500 - (Date.now() - lastCall)) / 1000) : 1;
    return `[Error 429]: ${mcpName} ha alcanzado el límite de velocidad. Espera ${waitTime} segundo${waitTime !== 1 ? 's' : ''} e intenta de nuevo.`;
  }

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

    // Preprocesamiento de input para casos especiales de Git
    let userInput = input;
    
    // Preprocesamiento de input
    const cloneMatch = input.match(/clona el repositorio ([^ ]+) en ([^\n]+)/i);
    if (cloneMatch) {
      const repoName = cloneMatch[1].trim();
      let destPath = cloneMatch[2].replace(/\\/g, '/').trim();
      if (destPath.endsWith('/')) destPath = destPath.slice(0, -1);
      if (/^d:\/documentos\/github$/i.test(destPath.replace(/\\/g, '/'))) {
        destPath = `${destPath}/${repoName}`;
        userInput = `Clona el repositorio ${repoName} en ${destPath}`;
      }
    }

    // Reemplazar 'en el repositorio <nombre>' por la ruta local
    const repoPhrase = "en el repositorio ";
    let idx = userInput.toLowerCase().indexOf(repoPhrase);
    while (idx !== -1) {
      const start = idx + repoPhrase.length;
      let end = start;
      while (end < userInput.length && (userInput[end].match(/[a-zA-Z0-9_-]/))) {
        end++;
      }
      const repoName = userInput.slice(start, end);
      if (repoName) {
        userInput = userInput.slice(0, idx) + `en D:/Documentos/GitHub/${repoName}` + userInput.slice(end);
      }
      idx = userInput.toLowerCase().indexOf(repoPhrase, idx + 1);
    }

    // Sistema dinámico: Claude analiza all_tools.json automáticamente
    try {
      const autoMapping = await findToolForQuery(input, claude);
      
      if (autoMapping) {
        const { tool, mcp, args } = autoMapping;
        const mcpIndex = servers.findIndex(cfg => (cfg.name || '').toLowerCase() === mcp.toLowerCase());
        const mcpClient = mcpIndex !== -1 ? clients[mcpIndex] : undefined;
        
        if (mcpClient && checkRateLimit(mcp)) {
          // Log detallado solo en session.log
          logInteraction('system', `✅ Herramienta seleccionada dinámicamente: ${tool} en ${mcp} con args: ${JSON.stringify(args)}`);
          await executeMCPTool(mcpClient, mcp, mcpIndex, tool, args, input);
          return;
        } else if (!mcpClient) {
          logInteraction('system', `❌ MCP ${mcp} no disponible`);
        } else {
          const rateLimitMsg = handleRateLimit(mcp);
          console.log(rateLimitMsg);
          logInteraction('assistant', rateLimitMsg);
          rl.prompt();
          return;
        }
      } else {
        logInteraction('system', `❌ No se encontró herramienta apropiada para: "${input}"`);
      }
    } catch (mappingError) {
      logInteraction('system', `⚠️  Error en mapeo dinámico: ${mappingError.message}`);
    }

    // Interacción normal con Claude si no se encontró mapeo
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