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

    // FLUJO: Claude actúa como dispatcher de tools
    // Se le pasa la lista de tools y el input, y debe responder con el nombre de la tool y los argumentos
  const dispatcherPrompt = `Eres un asistente que solo puede responder usando las siguientes tools JSON. Dado el mensaje del usuario, responde únicamente con un JSON de la forma {\n  \"tool\": <nombre_tool>,\n  \"args\": { ...argumentos... }\n}\nNo expliques nada, solo responde el JSON.\nIMPORTANTE: \n- Si el usuario pide crear un archivo, debes usar la tool 'write_file' y pasar correctamente los argumentos 'path' (ruta completa del archivo) y 'content' (contenido, puede ser vacío si el usuario no lo especifica).\n- Si la tool requiere un argumento 'owner' y el usuario no lo especifica, usa siempre 'paulabaal12' como valor por defecto.\nLista de tools disponibles:\n${JSON.stringify(allTools, null, 2)}\n\nMensaje del usuario:\n${input}`;
    let dispatcherResponse;
    try {
      dispatcherResponse = await claude.sendMessage(dispatcherPrompt, history);
      // Buscar JSON en la respuesta
      const jsonMatch = dispatcherResponse.content[0]?.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const toolCall = JSON.parse(jsonMatch[0]);
        const toolMatch = allTools.find(t => t.name === toolCall.tool);
        if (toolMatch) {
          const mcpName = toolMatch.mcp;
          const mcpIndex = servers.findIndex(cfg => (cfg.name || '').toLowerCase() === (mcpName || '').toLowerCase());
          const mcpClient = mcpIndex !== -1 ? clients[mcpIndex] : undefined;
          if (mcpClient) {
            try {
              console.log(`[Chatbot]: Ejecutando tool ${toolCall.tool} en ${mcpName}...`);
              const result = await mcpClient.callTool(toolCall.tool, toolCall.args || {});
              logInteraction('assistant', `[${mcpName}]:\n${JSON.stringify(result, null, 2)}`);
              // Pasa el resultado a Claude para interpretación
              const prompt = `Interpreta esta respuesta de un MCP para el usuario\n${JSON.stringify(result)}`;
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
            rl.prompt();
            return;
          } else {
            const msg = `[Chatbot]: No existe un tool MCP para esta acción.`;
            console.log(msg);
            logInteraction('assistant', msg);
            rl.prompt();
            return;
          }
        }
      }
    } catch (e) {
      // Si Claude no responde con JSON válido, sigue con el flujo normal
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
