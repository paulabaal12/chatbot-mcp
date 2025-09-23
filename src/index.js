import dotenv from "dotenv";
dotenv.config({ path: "./config/.env" });
import readline from "readline";
import chalk from "chalk";
import { loadServersConfig, createMCPClient } from "./mcp_clients.js";
import { ClaudeClient } from "./claude.js";
import { logInteraction, showLog } from "./log.js";
import { findToolForQuery } from "./dynamic_query_mapper.js";
import fs from "fs";
import { exec, execSync } from "child_process";

// Cargar tools de archivos JSON
let allTools = [];
try {
  allTools = JSON.parse(fs.readFileSync("config/all_tools.json", "utf8"));
} catch (e) {
  console.warn("[WARN] No se pudo cargar all_tools.json:", e);
}

// Función para formatear respuestas JSON de manera más legible
function formatMCPResponse(result, mcpName, toolName) {
  if (!result || result === null || result === undefined) {
    return "❌ No se encontró información";
  }
  
  // Extraer el contenido real si está dentro de estructuras MCP estándar
  let actualContent = result;
  
  // Si hay estructura content -> array -> text, extraer el texto
  if (result.content && Array.isArray(result.content) && result.content.length > 0) {
    const firstItem = result.content[0];
    if (firstItem.text) {
      try {
        // Si el texto es JSON válido, parsearlo
        actualContent = JSON.parse(firstItem.text);
      } catch (e) {
        // Si no es JSON, usar el texto tal como está
        actualContent = firstItem.text;
      }
    }
  }
  
  // Función recursiva para formatear cualquier estructura JSON de manera limpia
  function formatValue(value, indent = '') {
    if (value === null || value === undefined) {
      return 'Sin información';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) return 'Lista vacía';
      return value.map((item, index) => 
        `${indent}• ${formatValue(item, indent + '  ')}`
      ).join('\n');
    }
    
    if (typeof value === 'object') {
      const entries = Object.entries(value).filter(([key, val]) => 
        val !== null && val !== undefined && val !== ''
      );
      
      if (entries.length === 0) return 'Sin datos';
      
      return entries.map(([key, val]) => {
        const cleanKey = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').toLowerCase();
        const formattedValue = formatValue(val, indent + '  ');
        
        if (typeof val === 'object' && !Array.isArray(val)) {
          return `${indent}${cleanKey}:\n${formattedValue}`;
        } else {
          return `${indent}${cleanKey}: ${formattedValue}`;
        }
      }).join('\n');
    }
    
    return String(value);
  }
  
  return formatValue(actualContent);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.setPrompt(chalk.bold.cyan("🤖 [Chatbot] > "));
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
  }

  // Mostrar resumen de MCPs disponibles 
  console.log(chalk.bold.cyan("🤖 Chatbot MCP con Sistema Dinámico"));
  const mcpToolCounts = servers.map(cfg => {
    const name = cfg.name || "";
    return allTools.filter(t => (t.mcp || "").toLowerCase() === name.toLowerCase()).length;
  });
  const totalTools = mcpToolCounts.reduce((sum, count) => sum + count, 0);
  console.log(chalk.green(`📦 ${servers.length} MCPs cargados con ${chalk.bold(totalTools)} herramientas disponibles`));
  
  // Mostrar detalle de MCPs disponibles
  console.log(chalk.bold.blue("🔧 MCPs disponibles:"));
  servers.forEach((cfg, i) => {
    const name = cfg.name || `MCP ${i+1}`;
    const count = mcpToolCounts[i];
    console.log(chalk.cyan(`  • ${name}: ${chalk.bold.white(count)} tools`));
  });
  console.log(""); 

  // Inicializar MCP clients de forma segura con reintentos por si falla xd
  const results = await Promise.allSettled(servers.map(cfg => createMCPClient(cfg)));
  clients = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  // Función para reconectar MCPs si llegara a desconectarse
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
      console.log(chalk.cyan(`🔧 [Chatbot]: Ejecutando tool ${chalk.bold.white(toolName)} en ${chalk.bold.magenta(mcpName)}...`));
      
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

      // Automatización para operaciones Git que requieren directorio de trabajo (por si falla)
      if (mcpName.toLowerCase() === 'gitmcp' && 
          ['git_commit', 'git_push', 'git_add', 'git_status'].includes(toolName)) {
        
        // Verificar si hay error de "No session working directory"
        const needsWorkingDir = result && (
          JSON.stringify(result).includes('No session working directory') ||
          (typeof result === 'string' && result.includes('No session working directory'))
        );
        
        if (needsWorkingDir) {
          try {
            // Extraer path de los argumentos
            const workingPath = toolArgs.path;
            
            if (workingPath) {
              logInteraction('system', `Configurando directorio de trabajo Git: ${workingPath}`);
              console.log(`[Git Automatización]: Configurando directorio de trabajo: ${workingPath}`);
              
              // Configurar directorio de trabajo
              await mcpClient.callTool("git_set_working_dir", { path: workingPath });
              
              // Si es commit, hacer git_add primero
              if (toolName === 'git_commit') {
                await mcpClient.callTool("git_add", { path: workingPath });
                logInteraction('system', `git_add ejecutado en ${workingPath}`);
                console.log(`[Git Automatización]: git_add ejecutado en ${workingPath}`);
              }
              
              // Reintentar la operación original
              result = await mcpClient.callTool(toolName, toolArgs);
              logInteraction('system', `${toolName} ejecutado exitosamente`);
              console.log(`[Git Automatización]: ${toolName} ejecutado exitosamente`);
            }
          } catch (autoError) {
            logInteraction('system', `Error en automatización Git: ${autoError.message}`);
            console.log(`[Error Git Automatización]: ${autoError.message}`);
          }
        }
      }

      // Automatización específica para git_commit fallido (mantener como respaldo)
      if (toolName === "git_commit") {
        // Detectar error de diferentes formas
        const hasError = (result && result.error) || 
                        (typeof result === 'string' && result.toLowerCase().includes('error')) ||
                        (result && result.message && result.message.toLowerCase().includes('error')) ||
                        (result && JSON.stringify(result).toLowerCase().includes('error'));
        
        if (hasError) {
          try {
            logInteraction('system', `git_commit falló, intentando git_add automático...`);
            console.log(`[Automatización]: Detectado error en git_commit, ejecutando git_add...`);
            
            // Extraer path de los argumentos del commit original
            const commitPath = toolArgs.path;
            
            if (commitPath) {
              // Hacer git_add en el directorio específico
              await mcpClient.callTool("git_add", { path: commitPath });
              logInteraction('system', `git_add ejecutado en ${commitPath}`);
              console.log(`[Automatización]: git_add ejecutado en ${commitPath}`);
              
              // Reintentar el commit original
              result = await mcpClient.callTool(toolName, toolArgs);
              logInteraction('system', `git_commit reintentado exitosamente`);
              console.log(`[Automatización]: git_commit reintentado exitosamente`);
            } else {
              // Si no hay path específico, intentar git_add general
              await mcpClient.callTool("git_add", {});
              logInteraction('system', `git_add ejecutado (general)`);
              console.log(`[Automatización]: git_add ejecutado (general)`);
              
              result = await mcpClient.callTool(toolName, toolArgs);
              logInteraction('system', `git_commit reintentado exitosamente`);
              console.log(`[Automatización]: git_commit reintentado exitosamente`);
            }
          } catch (autoError) {
            logInteraction('system', `Error en automatización Git: ${autoError.message}`);
            console.log(`[Error Automatización]: ${autoError.message}`);
          }
        }
      }

      logInteraction('assistant', `[${mcpName}]:\n${JSON.stringify(result, null, 2)}`);
      
      // Formatear respuesta de manera legible
      const formattedResponse = formatMCPResponse(result, mcpName, toolName);
      
      let emoji = '🤖';
      if (mcpName.toLowerCase().includes('kitchen')) emoji = '🥗';
      else if (mcpName.toLowerCase().includes('git')) emoji = '📂';
      else if (mcpName.toLowerCase().includes('remote')) emoji = '🌐';
      else if (mcpName.toLowerCase().includes('filesystem')) emoji = '📁';
      else if (mcpName.toLowerCase().includes('sleep')) emoji = '💤';
      else if (mcpName.toLowerCase().includes('transfermarkt')) emoji = '⚽';
      
      console.log(`${emoji} [${mcpName}]: ${formattedResponse}`);
      
      // Registrar en el historial
      history.push({ role: "user", content: userInput });
      history.push({ role: "assistant", content: formattedResponse });
      logInteraction('user', userInput);
      logInteraction('assistant', formattedResponse);
      
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
      console.log(`❌ [Error]: ${msg}`);
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
      console.log(chalk.yellow("👋 ¡Hasta luego! Cerrando chatbot MCP..."));
      rl.close();
      clients.forEach(c => c.close());
      process.exit(0);
    }
    if (input.toLowerCase() === "log" || input.toLowerCase() === "historial") {
      console.log(chalk.blue("📜 Mostrando historial de conversación:"));
      showLog();
      rl.prompt();
      return;
    }

    // En este caso Claude analiza all_tools.json automáticamente
    try {
      const autoMapping = await findToolForQuery(input, claude, history);
      
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
      // Usar el historial completo para mantener contexto en la conversación
      const response = await claude.sendMessage(input, history);
      history.push({ role: "user", content: input });
      history.push({ role: "assistant", content: response.content[0]?.text || "(sin respuesta)" });
      logInteraction('user', input);
      logInteraction('assistant', response.content[0]?.text || "(sin respuesta)");
      console.log(`🧠 [Claude]: ${response.content[0]?.text || "(sin respuesta)"}`);
      rl.prompt();
    } catch (err) {
      console.error(`❌ [Claude]: Error al comunicarse con Claude: ${err}`);
      logInteraction('user', input);
      logInteraction('assistant', `Error al comunicarse con Claude: ${err}`);
      rl.prompt();
    }
  });
  
  // Mensaje de bienvenida final
  console.log(chalk.bold.green("Escribe tu consulta o 'exit' para salir."));
  console.log(chalk.gray("💡 Comandos especiales: 'log' para ver historial, 'exit' para salir\n"));
  rl.prompt();
}

main();