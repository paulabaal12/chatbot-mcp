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
  // Mostrar los MCP detectados (nombre y cantidad de tools usando all_tools.json)
  console.log("[INFO] MCPs detectados:");
  // Contar tools por MCP usando all_tools.json
  const mcpToolCounts = servers.map(cfg => {
    const name = cfg.name || "";
    return allTools.filter(t => (t.mcp || "").toLowerCase() === name.toLowerCase()).length;
  });
  servers.forEach((cfg, i) => {
    const name = cfg.name || `MCP ${i+1}`;
    const count = mcpToolCounts[i];
    console.log(`- ${name}: ${count} tools`);
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
    // Preprocesamiento: Si el usuario pide clonar un repo y la ruta destino es D:/Documentos/GitHub, ajusta para usar una subcarpeta
    // Además, si el usuario dice 'en el repositorio <nombre>', reemplaza por la ruta local
    let userInput = input;
    const cloneMatch = input.match(/clona el repositorio ([^ ]+) en ([^\n]+)/i);
    if (cloneMatch) {
      const repoName = cloneMatch[1].trim();
      let destPath = cloneMatch[2].replace(/\\/g, '/').trim();
      if (destPath.endsWith('/')) destPath = destPath.slice(0, -1);
      // Si la ruta destino es exactamente D:/Documentos/GitHub o similar, ajusta para usar una subcarpeta
      if (/^d:\/documentos\/github$/i.test(destPath.replace(/\\/g, '/'))) {
        destPath = `${destPath}/${repoName}`;
        userInput = `Clona el repositorio ${repoName} en ${destPath}`;
      }
    }

    // Nuevo: reemplazar 'en el repositorio <nombre>' por la ruta local, sin regex
    const repoPhrase = "en el repositorio ";
    let idx = userInput.toLowerCase().indexOf(repoPhrase);
    while (idx !== -1) {
      // Buscar el nombre del repo después de la frase
      const start = idx + repoPhrase.length;
      let end = start;
      while (end < userInput.length &&
        (userInput[end].match(/[a-zA-Z0-9_-]/))) {
        end++;
      }
      const repoName = userInput.slice(start, end);
      if (repoName) {
        userInput = userInput.slice(0, idx) + `en D:/Documentos/GitHub/${repoName}` + userInput.slice(end);
      }
      idx = userInput.toLowerCase().indexOf(repoPhrase, idx + 1);
    }

    const dispatcherPrompt = `Eres un asistente que solo puede responder usando las siguientes tools JSON. Dado el mensaje del usuario, responde únicamente con un JSON de la forma {\n  \"tool\": <nombre_tool>,\n  \"args\": { ...argumentos... }\n}\nNo expliques nada, solo responde el JSON.\nIMPORTANTE: \n- Si el usuario pide crear un archivo, debes usar la tool 'write_file' y pasar correctamente los argumentos 'path' (ruta completa del archivo) y 'content' (contenido, puede ser vacío si el usuario no lo especifica).\n- Si la tool requiere un argumento 'owner' y el usuario no lo especifica, usa siempre 'paulabaal12' como valor por defecto.\nLista de tools disponibles:\n${JSON.stringify(allTools, null, 2)}\n\nMensaje del usuario:\n${userInput}`;
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
              let result = await mcpClient.callTool(toolCall.tool, toolCall.args || {});


              // Automatización: flujo robusto tras crear/clonar repo
              let autoMsg = "";
              if (["git_clone", "github_clone_repo"].includes(toolCall.tool)) {
                // Si ya es clonación, set_working_dir directo
                let repoPath = toolCall.args?.destPath || toolCall.args?.path || (result?.structuredContent?.path) || (result?.path);
                if (repoPath) {
                  try {
                    await mcpClient.callTool("git_set_working_dir", { path: repoPath });
                    autoMsg += `\n\nℹ️  Se configuró automáticamente el directorio de trabajo de git en (${repoPath}).`;
                    console.log(`[Chatbot]: git_set_working_dir configurado automáticamente en ${repoPath}`);
                  } catch (e) {
                    const errMsg = e?.message || JSON.stringify(e);
                    console.log(`[Chatbot]: Error al configurar git_set_working_dir automáticamente: ${errMsg}`);
                    autoMsg += `\n\n⚠️  Error al configurar git_set_working_dir: ${errMsg}`;
                  }
                }
              } else if (toolCall.tool === "github_create_repo") {
                // Tras crear repo en GitHub, clónalo localmente y set_working_dir
                if (result?.full_name) {
                  const repoName = result.full_name.split("/")[1];
                  const destPath = `D:/Documentos/GitHub/${repoName}`;
                  try {
                    // Buscar el MCP adecuado para git (GitMCP)
                    const gitMcpIndex = servers.findIndex(cfg => (cfg.name || '').toLowerCase() === 'gitmcp');
                    const gitMcpClient = gitMcpIndex !== -1 ? clients[gitMcpIndex] : undefined;
                    if (gitMcpClient) {
                      await gitMcpClient.callTool("git_clone", { repositoryUrl: result.clone_url, targetPath: destPath });
                      autoMsg += `\n\nℹ️  Se clonó automáticamente el repositorio en ${destPath}.`;
                      try {
                        await gitMcpClient.callTool("git_set_working_dir", { path: destPath });
                        autoMsg += `\n\nℹ️  Se configuró automáticamente el directorio de trabajo de git en (${destPath}).`;
                        console.log(`[Chatbot]: git_set_working_dir configurado automáticamente en ${destPath}`);
                      } catch (e) {
                        const errMsg = e?.message || JSON.stringify(e);
                        console.log(`[Chatbot]: Error al configurar git_set_working_dir automáticamente: ${errMsg}`);
                        autoMsg += `\n\n⚠️  Error al configurar git_set_working_dir: ${errMsg}`;
                      }
                    } else {
                      autoMsg += `\n\n⚠️  No se encontró un MCP GitMCP para clonar el repo.`;
                    }
                  } catch (e) {
                    const errMsg = e?.message || JSON.stringify(e);
                    console.log(`[Chatbot]: Error al clonar repo tras github_create_repo: ${errMsg}`);
                    autoMsg += `\n\n⚠️  Error al clonar repo tras github_create_repo: ${errMsg}`;
                  }
                }
              }

              // Automatización: git_set_working_dir antes de commit y push, git_add, configurar user, commit, push
              if (toolCall.tool === "git_commit") {
                // Deducir ruta local del repo desde el input del usuario
                let repoPath = null;
                // Buscar "en D:/Documentos/GitHub/<repo>" en userInput
                const repoPhrase = "en D:/Documentos/GitHub/";
                let idx = userInput.indexOf(repoPhrase);
                if (idx !== -1) {
                  let start = idx + repoPhrase.length;
                  let end = start;
                  while (end < userInput.length &&
                    (userInput[end].match(/[a-zA-Z0-9_-]/))) {
                    end++;
                  }
                  // Extraer la ruta completa D:/Documentos/GitHub/<repo>
                  repoPath = `D:/Documentos/GitHub/${userInput.slice(start, end)}`;
                }
                if (!repoPath) {
                  // fallback: intenta con el nombre del repo en el argumento
                  if (toolCall.args && toolCall.args.repo) {
                    repoPath = `D:/Documentos/GitHub/${toolCall.args.repo}`;
                  } else if (toolCall.args && toolCall.args.path) {
                    repoPath = toolCall.args.path;
                  }
                }
                if (repoPath) {
                  try {
                    await mcpClient.callTool("git_set_working_dir", { path: repoPath });
                    autoMsg += `\n\nℹ️  git_set_working_dir configurado automáticamente en ${repoPath}`;
                  } catch (e) {
                    autoMsg += `\n\n⚠️  Error al configurar git_set_working_dir: ${e?.message || JSON.stringify(e)}`;
                  }
                }
                try {
                  await mcpClient.callTool("git_add", {});
                  autoMsg += `\n\nℹ️  Se realizó automáticamente git add antes del commit.`;
                } catch (e) {
                  autoMsg += `\n\n⚠️  Error en git add: ${e?.message || JSON.stringify(e)}`;
                }
                // Configurar user.name y user.email si falta
                // (Configuración automática de git user.name y user.email eliminada porque la tool git_config no está disponible en GitMCP)
                // Intentar commit
                let commitOk = false;
                let commitResult = null;
                try {
                  commitResult = await mcpClient.callTool("git_commit", toolCall.args || {});
                  autoMsg += `\n\nℹ️  Commit realizado correctamente.`;
                  commitOk = true;
                } catch (e) {
                  autoMsg += `\n\n❌ Error al hacer commit: ${e?.message || JSON.stringify(e)}`;
                  if (e?.message && /nothing to commit|no changes added to commit|working tree clean/i.test(e.message)) {
                    autoMsg += `\n\n⚠️  No hay archivos nuevos o cambios para commitear.`;
                  }
                }
                // push tras commit, siempre intentar push si hubo commit
                let pushOk = false;
                if (repoPath) {
                  try {
                    await mcpClient.callTool("git_set_working_dir", { path: repoPath });
                  } catch (e) {
                    autoMsg += `\n\n⚠️  Error al configurar git_set_working_dir antes de push: ${e?.message || JSON.stringify(e)}`;
                  }
                }
                try {
                  const pushResult = await mcpClient.callTool("git_push", { remote: "origin", branch: "main", path: repoPath });
                  autoMsg += `\n\nℹ️  Se realizó automáticamente un push al remoto después del commit.`;
                  autoMsg += `\n\nResultado de push: ${JSON.stringify(pushResult)}`;
                  console.log(`[Chatbot]: git push automático realizado tras commit.`);
                  pushOk = true;
                } catch (e) {
                  const errMsg = e?.message || JSON.stringify(e);
                  autoMsg += `\n\n⚠️  Error al hacer push automático: ${errMsg}`;
                  if (/rejected|fetch first|failed to push|non-fast-forward|remote contains work|pull before pushing|Updates were rejected/i.test(errMsg)) {
                    try {
                      autoMsg += `\n\nIntentando git pull --rebase para integrar cambios remotos...`;
                      await mcpClient.callTool("git_pull", { remote: "origin", branch: "main", rebase: true, path: repoPath });
                      autoMsg += `\n\nℹ️  git pull --rebase realizado correctamente.`;
                      if (repoPath) {
                        try {
                          await mcpClient.callTool("git_set_working_dir", { path: repoPath });
                        } catch (e) {
                          autoMsg += `\n\n⚠️  Error al configurar git_set_working_dir antes de push (post-pull): ${e?.message || JSON.stringify(e)}`;
                        }
                      }
                      try {
                        const pushResult2 = await mcpClient.callTool("git_push", { remote: "origin", branch: "main", path: repoPath });
                        autoMsg += `\n\nℹ️  Push realizado correctamente tras pull --rebase.`;
                        autoMsg += `\n\nResultado de push: ${JSON.stringify(pushResult2)}`;
                        pushOk = true;
                      } catch (e2) {
                        autoMsg += `\n\n❌ Error al hacer push tras pull --rebase: ${e2?.message || JSON.stringify(e2)}`;
                      }
                    } catch (e1) {
                      autoMsg += `\n\n❌ Error al hacer git pull --rebase: ${e1?.message || JSON.stringify(e1)}`;
                    }
                  }
                }
              }

              logInteraction('assistant', `[${mcpName}]:\n${JSON.stringify(result, null, 2)}`);
              // Si hubo autoMsg (por ejemplo, resultado de push), inclúyelo en el resultado para interpretación
              let resultForPrompt = result;
              let showError = result?.isError === true;
              // Si autoMsg indica que el commit y el push se realizaron correctamente, no mostrar error aunque isError sea true
              if (autoMsg && typeof result === 'object' && !Array.isArray(result)) {
                resultForPrompt = { ...result, _autoMsg: autoMsg };
                if (/Commit realizado correctamente/i.test(autoMsg) && /push.*(realizado correctamente|resultado de push)/i.test(autoMsg)) {
                  showError = false;
                }
              }
              // Pasa el resultado a Claude para interpretación, ajustando el mensaje si es solo advertencia
              let prompt;
              if (showError) {
                prompt = `Interpreta esta respuesta de un MCP para el usuario\n${JSON.stringify(resultForPrompt)}${autoMsg}`;
              } else {
                prompt = `Interpreta esta respuesta exitosa de un MCP para el usuario de forma natural y útil:\n${JSON.stringify(resultForPrompt)}${autoMsg}`;
              }
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
