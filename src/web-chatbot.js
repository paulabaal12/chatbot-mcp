import dotenv from "dotenv";
dotenv.config({ path: "./config/.env" });
import { loadServersConfig, createMCPClient } from "./mcp_clients.js";
import { ClaudeClient } from "./claude.js";
import { logInteraction } from "./log.js";
import { findToolForQuery } from "./dynamic_query_mapper.js";
import fs from "fs";
import { execSync } from "child_process";
/// ESTO DISQUE ES PARA LA UI JASDJ
// Variables globales para cachear
let allTools = [];
let serversLoaded = false;
let clients = [];
let servers = [];
const mcpRateLimits = new Map();

// Cargar configuración inicial
async function initializeIfNeeded() {
  if (serversLoaded) return;
  
  try {
    // Cargar tools de archivos JSON (sin regenerar para ser más rápido)
    try {
      allTools = JSON.parse(fs.readFileSync("config/all_tools.json", "utf8"));
    } catch (e) {
      console.warn("[WARN] No se pudo cargar all_tools.json:", e);
    }

    // Cargar servidores MCP
    servers = loadServersConfig("config/servers.json");
    
    // Inicializar MCP clients de forma rápida
    const results = await Promise.allSettled(
      servers.map(cfg => createMCPClient(cfg))
    );
    
    clients = results
      .filter(r => r.status === "fulfilled")
      .map(r => r.value);
    
    serversLoaded = true;
    console.log(`📦 ${clients.length} MCPs inicializados`);
    
  } catch (error) {
    console.error("[ERROR] Inicialización fallida:", error.message);
  }
}

async function processWebMessage(input, conversationHistory = []) {
  console.log(`🔄 Procesando: "${input}"`);
  
  try {
    // Inicializar solo si es necesario
    await initializeIfNeeded();
    
    const apiKey = process.env.CLAUDE_API_KEY;
    const claude = new ClaudeClient(apiKey);

    // Función para verificar rate limit
    function checkRateLimit(mcpName) {
      const now = Date.now();
      const lastCall = mcpRateLimits.get(mcpName);
      if (lastCall && (now - lastCall) < 500) {
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

    // Función auxiliar para ejecutar herramientas MCP
    async function executeMCPTool(mcpClient, mcpName, mcpIndex, toolName, toolArgs, userInput) {
      try {
        console.log(`[Chatbot]: Ejecutando tool ${toolName} en ${mcpName}...`);
        
        let result = await mcpClient.callTool(toolName, toolArgs);

        // Automatización para Git
        if (mcpName.toLowerCase() === 'gitmcp' && 
            ['git_commit', 'git_push', 'git_add', 'git_status'].includes(toolName)) {
          
          const needsWorkingDir = result && (
            JSON.stringify(result).includes('No session working directory') ||
            (typeof result === 'string' && result.includes('No session working directory'))
          );
          
          if (needsWorkingDir) {
            try {
              const workingPath = toolArgs.path;
              if (workingPath) {
                console.log(`[Git Automatización]: Configurando directorio de trabajo: ${workingPath}`);
                await mcpClient.callTool("git_set_working_dir", { path: workingPath });
                
                if (toolName === 'git_commit') {
                  await mcpClient.callTool("git_add", { path: workingPath });
                  console.log(`[Git Automatización]: git_add ejecutado en ${workingPath}`);
                }
                
                result = await mcpClient.callTool(toolName, toolArgs);
                console.log(`[Git Automatización]: ${toolName} ejecutado exitosamente`);
              }
            } catch (autoError) {
              console.log(`[Error Git Automatización]: ${autoError.message}`);
            }
          }
        }

        // Usar Claude para interpretar la respuesta
        const response = await claude.interpretMCPResponse(toolName, mcpName, result, userInput);
        
        logInteraction('user', userInput);
        logInteraction('assistant', response.content[0]?.text || "(sin respuesta)");
        
        // Imprimir el JSON original para TODOS los MCPs
        if (result && typeof result === 'object') {
          console.log(`[MCP-DIRECT]: ${JSON.stringify(result)}`);
        }
        
        console.log(`[Claude + ${mcpName}]: ${response.content[0]?.text || "(sin respuesta)"}`);
        
      } catch (err) {
        let msg;
        if (err.message && err.message.includes('Rate limit')) {
          msg = handleRateLimit(mcpName);
        } else {
          const errorDetails = err.message || err.toString() || 'Error desconocido';
          msg = `Error al invocar tool MCP: ${errorDetails}`;
        }
        console.log(`[Error]: ${msg}`);
        logInteraction('assistant', msg);
      }
    }

    // Sistema dinámico: Claude analiza all_tools.json automáticamente
    console.log(`🔍 Buscando herramienta para: "${input}"`);
    const autoMapping = await findToolForQuery(input, claude, conversationHistory);
    
    if (autoMapping) {
      const { tool, mcp, args } = autoMapping;
      console.log(`✅ Herramienta encontrada: ${tool} en ${mcp}`);
      
      const mcpIndex = servers.findIndex(cfg => (cfg.name || '').toLowerCase() === mcp.toLowerCase());
      const mcpClient = mcpIndex !== -1 ? clients[mcpIndex] : undefined;
      
      if (mcpClient && checkRateLimit(mcp)) {
        await executeMCPTool(mcpClient, mcp, mcpIndex, tool, args, input);
        return;
      } else if (!mcpClient) {
        console.log(`[Error]: MCP ${mcp} no disponible`);
        return;
      } else {
        const rateLimitMsg = handleRateLimit(mcp);
        console.log(rateLimitMsg);
        return;
      }
    }

    console.log(`🤖 Usando Claude para: "${input}"`);
    // Interacción normal con Claude si no se encontró mapeo - usar historial para contexto
    const response = await claude.sendMessage(input, conversationHistory);
    logInteraction('user', input);
    logInteraction('assistant', response.content[0]?.text || "(sin respuesta)");
    console.log("[Claude]:", response.content[0]?.text || "(sin respuesta)");

  } catch (err) {
    console.error("[Error]:", err.message || err);
    logInteraction('assistant', `Error: ${err.message || err}`);
  }
}

// Si se ejecuta como script principal
if (process.argv[2]) {
  const message = process.argv.slice(2, 3)[0]; // Solo el primer argumento es el mensaje
  const historyFile = process.argv[3]; // El segundo argumento es el archivo de historial
  
  let conversationHistory = [];
  if (historyFile) {
    try {
      const historyData = fs.readFileSync(historyFile, 'utf8');
      conversationHistory = JSON.parse(historyData);
    } catch (err) {
      console.warn('No se pudo cargar historial de conversación:', err.message);
    }
  }
  
  processWebMessage(message, conversationHistory).then(() => {
    process.exit(0);
  }).catch(err => {
    console.error("[Error]:", err);
    process.exit(1);
  });
} else {
  // Modo stdin para servidor web
  process.stdin.on('data', async (data) => {
    const message = data.toString().trim();
    if (message) {
      await processWebMessage(message);
      process.exit(0);
    }
  });
}