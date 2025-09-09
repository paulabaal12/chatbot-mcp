import { loadServersConfig, createMCPClient } from "../src/mcp_clients.js";
import fs from "fs";

async function main() {
  const servers = loadServersConfig("config/servers.json");
  console.log("[INFO] MCPs encontrados en servers.json:");
  servers.forEach((cfg, i) => {
    const name = cfg.name || `MCP ${i+1}`;
    const cmd = [cfg.command, ...(cfg.args || [])].join(' ');
    console.log(`- ${name}: ${cmd}`);
  });
  const results = await Promise.allSettled(servers.map(cfg => createMCPClient(cfg)));
  const clients = results.filter(r => r.status === "fulfilled").map((r, i) => {
    if (r.value) {
      console.log(`[OK] MCP lanzado: ${servers[i].name}`);
    } else {
      console.log(`[FAIL] MCP no lanzado: ${servers[i].name}`);
    }
    return r.value;
  }).filter(Boolean);
  let allTools = [];
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const cfg = servers[i];
    try {
      if (typeof c.initialize === 'function') await c.initialize();
      const toolsResp = await c.listTools();
      const toolsArr = Array.isArray(toolsResp) ? toolsResp : (toolsResp.tools || []);
      console.log(`[INFO] Tools de ${cfg.name}:`, toolsArr.map(t => t.name).join(", ") || '(ninguno)');
      for (const t of toolsArr) {
        allTools.push({
          name: t.name,
          title: t.title,
          description: t.description,
          input_schema: t.inputSchema || t.input_schema || {},
          output_schema: t.outputSchema || t.output_schema || {},
          annotations: t.annotations || {},
          mcp: cfg.name || `MCP${i+1}`
        });
      }
    } catch (err) {
      console.log(`[ERROR] Al obtener tools de ${cfg.name}:`, err);
    }
  }
  // Guardar tools.json
  fs.writeFileSync("config/all_tools.json", JSON.stringify(allTools, null, 2), "utf8");
  // Cerrar MCP
  clients.forEach(c => c.close && c.close());
}

main();