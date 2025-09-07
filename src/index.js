// =======================
// IMPORTS Y CONFIGURACIÓN GLOBAL
// =======================
import readline from 'readline';
import { sendMessageToClaude } from './claude.js';
import { logInteraction, showLog } from './log.js';
import { crearRepositorio, crearRepositorioRemoto } from './mcp_oficiales.js';

const BASE_DIR = 'D:/Documentos/GitHub';
const messages = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// =======================
// REGEX FLEXIBLES (PARSING)
// =======================
const flexibleDeleteRepo = /(?:elimina|borra|quita).*repositorio\s+([\w-]+)/i;
const flexibleEditReadme = /modifica.*readme.*(?:de|en)?\s*([\w-]+).*con\s+texto\s+(.+)/i;
const flexibleEditFile = /(?:modifica|edita|cambia).*archivo.*(?:en\s+)?([A-Za-z]:[\\/][^\s]+).*con\s+texto\s+(.+)/i;
const flexibleDeleteFile = /(?:elimina|borra|quita).*archivo.*(?:en\s+)?([A-Za-z]:[\\/][^\s]+)/i;
const flexibleCreateFile = /(?:crea(?:r)?|agrega|genera|haz).*archivo\s+([\w.-]+).*en\s+([A-Za-z]:[\\/][^\s]+)(?:.*con\s+texto\s+(.+))?/i;
const flexibleCommit = /(?:commit|commitea|haz.*commit|puedes.*commit).*?(?:en|a)?(?: mi)? repositorio\s+([\w-]+).*?(?:con\s+(?:mensaje|nombre)\s+(.+))?/i;
const naturalCreateFull = /(?:crear|creame|haz|puedes crear|quiero crear|sube|publica).*repositorio\s+([\w-]+)(?:\s+con\s+readme\s+(.+?))?(?:\s+commit\s+(.+?))?(?:\s+en\s+github)?$/i;
const repoCustomRegex = /crea(?:me)?(?:r)?(?: un)? repositorio\s+([\w-]+)(?:\s+con\s+readme\s+(.+?))?(?:\s+commit\s+(.+))?$/i;
const publishRegex = /publica repo ([\w-]+) como ([\w-]+)/i;

// =======================
// FUNCIÓN PRINCIPAL DE PARSING Y FLUJO
// =======================

// Handler para eliminar repositorio local y remoto (GitHub)
async function eliminarRepositorioPorNombre(nombreRepo) {
  const { MCPStdioClient } = await import('./mcp_clients.js');
  const npxCmd = 'npx.cmd';
  const baseDir = 'D:/Documentos/GitHub';
  const pathModule = await import('path');
  const fs = await import('fs');
  const repoPath = pathModule.join(baseDir, nombreRepo);
  const fsClient = new MCPStdioClient(npxCmd, ['-y', '@modelcontextprotocol/server-filesystem', baseDir]);
  let localMsg = '';
  let remoteMsg = '';
  try {
    await fsClient.callTool('delete_directory', { path: repoPath, recursive: true });
    fsClient.close();
    // Verificar si la carpeta realmente se borró
    if (fs.existsSync(repoPath)) {
      const { execSync } = await import('child_process');
      try {
        execSync(`Remove-Item -Path '${repoPath}' -Recurse -Force`, { shell: 'powershell.exe' });
      } catch (psErr) {
        // ignorar, reportar después
      }
      if (fs.existsSync(repoPath)) {
        localMsg = `La carpeta local '${repoPath}' NO se pudo borrar completamente.\nIncluso forzando con PowerShell. Sugerencia: Reinicia tu PC o elimina manualmente.`;
      } else {
        localMsg = `Repositorio local '${nombreRepo}' eliminado (carpeta borrada, forzado con PowerShell).`;
      }
    } else {
      localMsg = `Repositorio local '${nombreRepo}' eliminado (carpeta borrada).`;
    }
  } catch (err) {
    fsClient.close();
    localMsg = 'Error al eliminar repositorio local: ' + (err && err.message ? err.message : err);
  }
  // Intentar eliminar el repo remoto en GitHub
  try {
    const { exec } = await import('child_process');
    remoteMsg = await new Promise((resolve, reject) => {
      exec(`gh repo delete paulabaal12/${nombreRepo} --yes`, { shell: true }, (error, stdout, stderr) => {
        if (error) {
          if (stderr && stderr.includes('Could not resolve to a Repository')) {
            resolve(`Repositorio remoto 'paulabaal12/${nombreRepo}' no existe en GitHub o ya fue eliminado.`);
          } else if (stderr && stderr.includes('delete_repo')) {
            resolve(`No tienes permisos suficientes para eliminar el repo remoto.\nPara habilitarlo, ejecuta en tu terminal:\n  gh auth refresh -h github.com -s delete_repo\nY asegúrate de tener permisos de administrador en el repositorio.`);
          } else if (stderr && stderr.includes('admin rights')) {
            resolve(`No tienes permisos de administrador para eliminar el repo remoto.\nSolicita acceso de administrador en GitHub para 'paulabaal12/${nombreRepo}'.`);
          } else {
            resolve(`Error al eliminar repo remoto: ${stderr || error.message}`);
          }
        } else {
          resolve(`Repositorio remoto 'paulabaal12/${nombreRepo}' eliminado de GitHub.`);
        }
      });
    });
  } catch (err) {
    remoteMsg = 'Error al intentar eliminar repo remoto: ' + (err && err.message ? err.message : err);
  }
  return `${localMsg}\n${remoteMsg}`;
}

// Handler para modificar README de un repo por nombre
async function modificarReadmePorRepo(nombreRepo, texto) {
  const { MCPStdioClient } = await import('./mcp_clients.js');
  const npxCmd = 'npx.cmd';
  const baseDir = 'D:/Documentos/GitHub';
  const pathModule = await import('path');
  const repoPath = pathModule.join(baseDir, nombreRepo);
  const readmePath = pathModule.join(repoPath, 'README.md');
  const fsClient = new MCPStdioClient(npxCmd, ['-y', '@modelcontextprotocol/server-filesystem', repoPath]);
  try {
    await fsClient.callTool('write_file', { path: readmePath, content: texto });
    fsClient.close();
    return `README.md de '${nombreRepo}' modificado.`;
  } catch (err) {
    fsClient.close();
    throw new Error('Error al modificar README: ' + (err && err.message ? err.message : err));
  }
}

// Handler para modificar archivo usando MCP Filesystem
async function modificarArchivoRutaAbsoluta(rutaDestino, texto) {
  const { MCPStdioClient } = await import('./mcp_clients.js');
  const npxCmd = 'npx.cmd';
  const pathModule = await import('path');
  const carpeta = pathModule.dirname(rutaDestino);
  const fsClient = new MCPStdioClient(npxCmd, ['-y', '@modelcontextprotocol/server-filesystem', carpeta]);
  try {
    await fsClient.callTool('write_file', {
      path: rutaDestino,
      content: texto
    });
    fsClient.close();
    return `Archivo modificado en '${rutaDestino}'.`;
  } catch (err) {
    fsClient.close();
    throw new Error('Error al modificar archivo: ' + (err && err.message ? err.message : err));
  }
}

// Handler para eliminar archivo usando MCP Filesystem
async function eliminarArchivoRutaAbsoluta(rutaDestino) {
  const { MCPStdioClient } = await import('./mcp_clients.js');
  const npxCmd = 'npx.cmd';
  const pathModule = await import('path');
  const carpeta = pathModule.dirname(rutaDestino);
  const fsClient = new MCPStdioClient(npxCmd, ['-y', '@modelcontextprotocol/server-filesystem', carpeta]);
  try {
    await fsClient.callTool('delete_file', { path: rutaDestino });
    fsClient.close();
    return `Archivo eliminado en '${rutaDestino}'.`;
  } catch (err) {
    fsClient.close();
    throw new Error('Error al eliminar archivo: ' + (err && err.message ? err.message : err));
  }
}

async function crearArchivoRutaAbsoluta(nombreArchivo, rutaDestino) {
  // Usa MCP Filesystem server para crear el archivo en la ruta absoluta
  const { MCPStdioClient } = await import('./mcp_clients.js');
  const npxCmd = 'npx.cmd';
  // Extrae carpeta destino
  const pathModule = await import('path');
  const fs = await import('fs');
  const carpeta = pathModule.dirname(rutaDestino);
  if (!fs.existsSync(carpeta)) {
    fs.mkdirSync(carpeta, { recursive: true });
  }
  const fsClient = new MCPStdioClient(npxCmd, ['-y', '@modelcontextprotocol/server-filesystem', carpeta]);
  try {
    await fsClient.callTool('create_directory', { path: carpeta });
    await fsClient.callTool('write_file', {
      path: rutaDestino,
      content: arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : `Archivo ${nombreArchivo} creado por el chatbot.\n`
    });
    fsClient.close();
    return `Archivo '${nombreArchivo}' creado en '${rutaDestino}'.`;
  } catch (err) {
    fsClient.close();
    throw new Error('Error al crear archivo: ' + (err && err.message ? err.message : err));
  }
}

console.log('Chatbot anfitrión iniciado. Escribe tu mensaje (Ctrl+C para salir):');
console.log('\nEjemplos de comandos disponibles:');
console.log('  - creame un repositorio NOMBRE con readme TEXTO commit MENSAJE');
console.log('  - haz un commit a mi repositorio NOMBRE con mensaje MENSAJE');
console.log('  - crea un archivo archivo.txt en D:/Documentos/GitHub/miRepo/archivo.txt con texto Hola mundo');
console.log('  - modifica el archivo D:/Documentos/GitHub/miRepo/archivo.txt con texto Nuevo contenido');
console.log('  - elimina el archivo D:/Documentos/GitHub/miRepo/archivo.txt');
console.log('  - modifica el README de miRepo con texto Este es el nuevo README');
console.log('  - elimina el repositorio miRepo');
console.log('  - historial   (muestra el historial de mensajes)');
console.log('');

// =======================
// FUNCIÓN PRINCIPAL DE PARSING Y FLUJO
// =======================
async function handleInput(input) {
  // --- Eliminar repositorio completo por nombre ---
  const matchDeleteRepo = input.match(flexibleDeleteRepo);
  if (matchDeleteRepo && matchDeleteRepo[1]) {
    const nombreRepo = matchDeleteRepo[1].trim();
    logInteraction('user', input);
    messages.push({ role: 'user', content: input });
    try {
      const resultado = await eliminarRepositorioPorNombre(nombreRepo);
      logInteraction('mcp', resultado);
      messages.push({ role: 'assistant', content: resultado });
      console.log(`[MCP]: ${resultado}`);
    } catch (err) {
      const errMsg = 'Error al eliminar repositorio: ' + (err && err.message ? err.message : err);
      logInteraction('mcp', errMsg);
      messages.push({ role: 'assistant', content: errMsg });
      console.log(`[MCP]: ${errMsg}`);
    }
    promptUser();
    return;
  }

  // --- Modificar README de un repo por nombre ---
  const matchEditReadme = input.match(flexibleEditReadme);
  if (matchEditReadme && matchEditReadme[1]) {
    const nombreRepo = matchEditReadme[1].trim();
    let textoArchivo = matchEditReadme[2] ? matchEditReadme[2].trim() : undefined;
    if (!textoArchivo) {
      // Preguntar por el texto si no se especificó
      console.log(`[MCP]: ¿Con qué texto quieres modificar el README de '${nombreRepo}'?`);
      rl.question('Texto para el README: ', async (respuesta) => {
        textoArchivo = respuesta && respuesta.trim() ? respuesta.trim() : undefined;
        logInteraction('user', input + (textoArchivo ? ` [texto: ${textoArchivo}]` : ''));
        messages.push({ role: 'user', content: input + (textoArchivo ? ` [texto: ${textoArchivo}]` : '') });
        try {
          const resultado = await modificarReadmePorRepo(nombreRepo, textoArchivo);
          logInteraction('mcp', resultado);
          messages.push({ role: 'assistant', content: resultado });
          console.log(`[MCP]: ${resultado}`);
        } catch (err) {
          const errMsg = 'Error al modificar README: ' + (err && err.message ? err.message : err);
          logInteraction('mcp', errMsg);
          messages.push({ role: 'assistant', content: errMsg });
          console.log(`[MCP]: ${errMsg}`);
        }
        promptUser();
      });
      return;
    } else {
      logInteraction('user', input + ` [texto: ${textoArchivo}]`);
      messages.push({ role: 'user', content: input + ` [texto: ${textoArchivo}]` });
      try {
        const resultado = await modificarReadmePorRepo(nombreRepo, textoArchivo);
        logInteraction('mcp', resultado);
        messages.push({ role: 'assistant', content: resultado });
        console.log(`[MCP]: ${resultado}`);
      } catch (err) {
        const errMsg = 'Error al modificar README: ' + (err && err.message ? err.message : err);
        logInteraction('mcp', errMsg);
        messages.push({ role: 'assistant', content: errMsg });
        console.log(`[MCP]: ${errMsg}`);
      }
      promptUser();
      return;
    }
  }
  // --- Modificar archivo en ruta absoluta, flexible ---
  const matchEditFile = input.match(flexibleEditFile);
  if (matchEditFile && matchEditFile[1]) {
    const rutaDestino = matchEditFile[1].trim();
    let textoArchivo = matchEditFile[2] ? matchEditFile[2].trim() : undefined;
    if (!textoArchivo) {
      // Preguntar por el texto si no se especificó
      console.log(`[MCP]: ¿Con qué texto quieres modificar el archivo '${rutaDestino}'?`);
      rl.question('Texto para el archivo: ', async (respuesta) => {
        textoArchivo = respuesta && respuesta.trim() ? respuesta.trim() : undefined;
        logInteraction('user', input + (textoArchivo ? ` [texto: ${textoArchivo}]` : ''));
        messages.push({ role: 'user', content: input + (textoArchivo ? ` [texto: ${textoArchivo}]` : '') });
        try {
          const resultado = await modificarArchivoRutaAbsoluta(rutaDestino, textoArchivo);
          logInteraction('mcp', resultado);
          messages.push({ role: 'assistant', content: resultado });
          console.log(`[MCP]: ${resultado}`);
        } catch (err) {
          const errMsg = 'Error al modificar archivo: ' + (err && err.message ? err.message : err);
          logInteraction('mcp', errMsg);
          messages.push({ role: 'assistant', content: errMsg });
          console.log(`[MCP]: ${errMsg}`);
        }
        promptUser();
      });
      return;
    } else {
      logInteraction('user', input + ` [texto: ${textoArchivo}]`);
      messages.push({ role: 'user', content: input + ` [texto: ${textoArchivo}]` });
      try {
        const resultado = await modificarArchivoRutaAbsoluta(rutaDestino, textoArchivo);
        logInteraction('mcp', resultado);
        messages.push({ role: 'assistant', content: resultado });
        console.log(`[MCP]: ${resultado}`);
      } catch (err) {
        const errMsg = 'Error al modificar archivo: ' + (err && err.message ? err.message : err);
        logInteraction('mcp', errMsg);
        messages.push({ role: 'assistant', content: errMsg });
        console.log(`[MCP]: ${errMsg}`);
      }
      promptUser();
      return;
    }
  }

  // --- Eliminar archivo en ruta absoluta, flexible ---
  const matchDeleteFile = input.match(flexibleDeleteFile);
  if (matchDeleteFile && matchDeleteFile[1]) {
    const rutaDestino = matchDeleteFile[1].trim();
    logInteraction('user', input);
    messages.push({ role: 'user', content: input });
    try {
      const resultado = await eliminarArchivoRutaAbsoluta(rutaDestino);
      logInteraction('mcp', resultado);
      messages.push({ role: 'assistant', content: resultado });
      console.log(`[MCP]: ${resultado}`);
    } catch (err) {
      const errMsg = 'Error al eliminar archivo: ' + (err && err.message ? err.message : err);
      logInteraction('mcp', errMsg);
      messages.push({ role: 'assistant', content: errMsg });
      console.log(`[MCP]: ${errMsg}`);
    }
    promptUser();
    return;
  }
  // --- Crear archivo en ruta absoluta, flexible y con texto opcional ---
  const matchCreateFile = input.match(flexibleCreateFile);
  if (matchCreateFile && matchCreateFile[1] && matchCreateFile[2]) {
    const nombreArchivo = matchCreateFile[1].trim();
    const rutaDestino = matchCreateFile[2].trim();
    let textoArchivo = matchCreateFile[3] ? matchCreateFile[3].trim() : undefined;
    if (!textoArchivo) {
      // Preguntar por el texto si no se especificó
      console.log(`[MCP]: ¿Qué texto quieres agregar al archivo '${nombreArchivo}'? (Deja vacío para usar el texto por defecto)`);
      rl.question('Texto para el archivo: ', async (respuesta) => {
        textoArchivo = respuesta && respuesta.trim() ? respuesta.trim() : undefined;
        logInteraction('user', input + (textoArchivo ? ` [texto: ${textoArchivo}]` : ''));
        messages.push({ role: 'user', content: input + (textoArchivo ? ` [texto: ${textoArchivo}]` : '') });
        try {
          const resultado = await crearArchivoRutaAbsoluta(nombreArchivo, rutaDestino, textoArchivo);
          logInteraction('mcp', resultado);
          messages.push({ role: 'assistant', content: resultado });
          console.log(`[MCP]: ${resultado}`);
        } catch (err) {
          const errMsg = 'Error al crear archivo: ' + (err && err.message ? err.message : err);
          logInteraction('mcp', errMsg);
          messages.push({ role: 'assistant', content: errMsg });
          console.log(`[MCP]: ${errMsg}`);
        }
        promptUser();
      });
      return;
    } else {
      logInteraction('user', input + ` [texto: ${textoArchivo}]`);
      messages.push({ role: 'user', content: input + ` [texto: ${textoArchivo}]` });
      try {
        const resultado = await crearArchivoRutaAbsoluta(nombreArchivo, rutaDestino, textoArchivo);
        logInteraction('mcp', resultado);
        messages.push({ role: 'assistant', content: resultado });
        console.log(`[MCP]: ${resultado}`);
      } catch (err) {
        const errMsg = 'Error al crear archivo: ' + (err && err.message ? err.message : err);
        logInteraction('mcp', errMsg);
        messages.push({ role: 'assistant', content: errMsg });
        console.log(`[MCP]: ${errMsg}`);
      }
      promptUser();
      return;
    }
  }
  // --- Detección de frases naturales para crear/publicar repositorios con README y commit ---
  // Ejemplo: "creame un repositorio howdiditend con readme TEXTO commit MENSAJE"
  const naturalCreateFull = /(?:crear|creame|haz|puedes crear|quiero crear|sube|publica).*repositorio\s+([\w-]+)(?:\s+con\s+readme\s+(.+?))?(?:\s+commit\s+(.+?))?(?:\s+en\s+github)?$/i;
  const matchNaturalFull = input.match(naturalCreateFull);
  if (matchNaturalFull && matchNaturalFull[1]) {
    const nombre = matchNaturalFull[1].trim();
    const readmeText = matchNaturalFull[2] ? matchNaturalFull[2].trim() : undefined;
    const commitMsg = matchNaturalFull[3] ? matchNaturalFull[3].trim() : undefined;
    logInteraction('user', input);
    messages.push({ role: 'user', content: input });
    console.log(`[MCP]: Creando y publicando el repositorio '${nombre}' en GitHub, por favor espera...`);
    try {
      // Crea local y luego publica remoto
      const resultadoLocal = await crearRepositorio(nombre, readmeText, commitMsg);
      const resultadoRemoto = await crearRepositorioRemoto(nombre, 'paulabaal12'); // <-- tu usuario
      logInteraction('mcp', resultadoLocal + '\n' + resultadoRemoto);
      messages.push({ role: 'assistant', content: resultadoLocal + '\n' + resultadoRemoto });
      console.log(`[MCP]: ${resultadoLocal}\n${resultadoRemoto}`);
    } catch (err) {
      const errMsg = 'Error al crear/publicar el repositorio: ' + (err && err.message ? err.message : err);
      logInteraction('mcp', errMsg);
      messages.push({ role: 'assistant', content: errMsg });
      console.log(`[MCP]: ${errMsg}`);
    }
    promptUser();
    return;
  }

  // --- Detección flexible para commit en cualquier orden ---
  // Ejemplo: "haz un commit a mi repositorio pollito con mensaje prueba" o "puedes hacer un commit con el nombre prueba1 en mi repositorio pollito"
  const flexibleCommit = /(?:commit|commitea|haz.*commit|puedes.*commit).*?(?:en|a)?(?: mi)? repositorio\s+([\w-]+).*?(?:con\s+(?:mensaje|nombre)\s+(.+))?/i;
  const matchCommit = input.match(flexibleCommit);
  if (matchCommit && matchCommit[1]) {
    const nombre = matchCommit[1].trim();
    const commitMsg = matchCommit[2] ? matchCommit[2].trim() : 'commit via chatbot';
    logInteraction('user', input);
    messages.push({ role: 'user', content: input });
    console.log(`[MCP]: Haciendo commit en el repositorio '${nombre}'...`);
    try {
      // Solo commit, no crea ni readme
      const baseDir = 'D:/Documentos/GitHub';
      const pathModule = await import('path');
      const repoPath = pathModule.join(baseDir, nombre);
      const { exec } = await import('child_process');
      // git add .
      const addResult = await new Promise((resolve, reject) => {
        exec('git add .', { cwd: repoPath, shell: true }, (error, stdout, stderr) => {
          if (error) reject(stderr || error.message);
          else resolve(stdout + stderr);
        });
      });
      // git commit
      let commitResult = '';
      let commitSuccess = true;
      try {
        commitResult = await new Promise((resolve, reject) => {
          exec(`git commit -m "${commitMsg.replace(/"/g, '\"')}"`, { cwd: repoPath, shell: true }, (error, stdout, stderr) => {
            if (error) {
              // Si no hay cambios, git devuelve código 1 y mensaje específico
              if (stderr && stderr.includes('nothing to commit')) {
                commitSuccess = false;
                resolve(stdout + stderr);
              } else {
                reject(stderr || error.message);
              }
            } else {
              resolve(stdout + stderr);
            }
          });
        });
      } catch (e) {
        commitSuccess = false;
        commitResult = e;
      }
      let pushResult = '';
      if (commitSuccess) {
        pushResult = await new Promise((resolve, reject) => {
          exec('git push origin main', { cwd: repoPath, shell: true }, (error, stdout, stderr) => {
            if (error) reject(stderr || error.message);
            else resolve(stdout + stderr);
          });
        });
      }
      let msg;
      if (!commitSuccess) {
        msg = `No hay cambios para commitear en '${nombre}'.\nResultado git commit:\n${commitResult}`;
      } else {
        msg = `Commit realizado y pusheado en '${nombre}' con mensaje: ${commitMsg}\nResultado git commit:\n${commitResult}\nResultado git push:\n${pushResult}`;
      }
      logInteraction('mcp', msg);
      messages.push({ role: 'assistant', content: msg });
      console.log(`[MCP]: ${msg}`);
    } catch (err) {
      const errMsg = 'Error al hacer commit/push: ' + (err && err.message ? err.message : err);
      logInteraction('mcp', errMsg);
      messages.push({ role: 'assistant', content: errMsg });
      console.log(`[MCP]: ${errMsg}`);
    }
    promptUser();
    return;
  }
  const lower = input.trim().toLowerCase();
  if (lower === 'historial') {
    showLog();
    promptUser();
    return;
  }

  // Comando para publicar repo remoto: publica repo <nombre> como <usuarioGitHub>
  const publishRegex = /publica repo ([\w-]+) como ([\w-]+)/i;
  const matchPublish = input.match(publishRegex);
  if (matchPublish && matchPublish[1] && matchPublish[2]) {
    const nombre = matchPublish[1].trim();
    const usuarioGitHub = matchPublish[2].trim();
    logInteraction('user', input);
    messages.push({ role: 'user', content: input });
    console.log('[MCP]: Publicando en GitHub, por favor espera...');
    try {
      const resultado = await Promise.race([
        crearRepositorioRemoto(nombre, usuarioGitHub),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: El proceso de publicación tardó demasiado.')), 180000)) // 3 minutos
      ]);
      logInteraction('mcp', resultado);
      messages.push({ role: 'assistant', content: resultado });
      // Solo mostrar respuesta de Claude si hubo error
      if (resultado.toLowerCase().includes('error')) {
        let respuestaClaude;
        try {
          const mensajesValidos = messages.filter(m => m.content && m.content.trim() !== '');
          respuestaClaude = await sendMessageToClaude(mensajesValidos);
          if (!respuestaClaude || typeof respuestaClaude !== 'string') {
            respuestaClaude = 'Ocurrió un error al comunicarse con Claude.';
          }
        } catch (e) {
          console.log('Error al comunicarse con Claude:', e && e.stack ? e.stack : (e.message || e));
          respuestaClaude = 'Ocurrió un error al comunicarse con Claude.';
        }
        console.log(`[Claude]: ${respuestaClaude}`);
        logInteraction('claude', respuestaClaude);
        messages.push({ role: 'assistant', content: respuestaClaude });
      }
      console.log(`[MCP]: ${resultado}`);
    } catch (err) {
      const errMsg = 'Error al publicar el repositorio: ' + (err && err.message ? err.message : err);
      logInteraction('mcp', errMsg);
      messages.push({ role: 'assistant', content: errMsg });
      let respuestaClaude;
      try {
        const mensajesValidos = messages.filter(m => m.content && m.content.trim() !== '');
        respuestaClaude = await sendMessageToClaude(mensajesValidos);
        if (!respuestaClaude || typeof respuestaClaude !== 'string') {
          respuestaClaude = 'Ocurrió un error al comunicarse con Claude.';
        }
      } catch (e) {
        console.log('Error al comunicarse con Claude:', e && e.stack ? e.stack : (e.message || e));
        respuestaClaude = 'Ocurrió un error al comunicarse con Claude.';
      }
      console.log(`[Claude]: ${respuestaClaude}`);
      logInteraction('claude', respuestaClaude);
      messages.push({ role: 'assistant', content: respuestaClaude });
      console.log(`[MCP]: ${errMsg}`);
    }
    promptUser();
    return;
  }

  // Mejor detección de frases para crear repositorios locales con opciones personalizadas
  // Ejemplo: creame un repositorio paulis con readme .
  const repoCustomRegex = /crea(?:me)?(?:r)?(?: un)? repositorio\s+([\w-]+)(?:\s+con\s+readme\s+(.+?))?(?:\s+commit\s+(.+))?$/i;
  const matchCustom = input.match(repoCustomRegex);
  if (matchCustom && matchCustom[1]) {
    const nombre = matchCustom[1].trim();
    const readmeText = matchCustom[2] ? matchCustom[2].trim() : undefined;
    const commitMsg = matchCustom[3] ? matchCustom[3].trim() : undefined;
    logInteraction('user', input);
    messages.push({ role: 'user', content: input });
    console.log('[MCP]: Procesando, por favor espera...');
    try {
      // Timeout de 30 segundos para evitar cuelgues
      const resultado = await Promise.race([
        crearRepositorio(nombre, readmeText, commitMsg),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: El proceso MCP tardó demasiado.')), 30000))
      ]);
      logInteraction('mcp', resultado);
      messages.push({ role: 'assistant', content: resultado });
      // Enviar el resultado a Claude para que tenga contexto
      let respuestaClaude;
      try {
        const mensajesValidos = messages.filter(m => m.content && m.content.trim() !== '');
        respuestaClaude = await sendMessageToClaude(mensajesValidos);
        if (!respuestaClaude || typeof respuestaClaude !== 'string') {
          respuestaClaude = 'Ocurrió un error al comunicarse con Claude.';
        }
      } catch (e) {
        console.log('Error al comunicarse con Claude:', e && e.stack ? e.stack : (e.message || e));
        respuestaClaude = 'Ocurrió un error al comunicarse con Claude.';
      }
      // Mostrar primero la respuesta de Claude
      console.log(`[Claude]: ${respuestaClaude}`);
      logInteraction('claude', respuestaClaude);
      messages.push({ role: 'assistant', content: respuestaClaude });
      // Mostrar también el resultado MCP como referencia
      console.log(`[MCP]: ${resultado}`);
    } catch (err) {
      const errMsg = 'Error al crear el repositorio: ' + (err && err.message ? err.message : err);
      logInteraction('mcp', errMsg);
      messages.push({ role: 'assistant', content: errMsg });
      // También enviar el error a Claude para contexto
      let respuestaClaude;
      try {
        respuestaClaude = await sendMessageToClaude(messages);
        if (!respuestaClaude || typeof respuestaClaude !== 'string') {
          respuestaClaude = 'Ocurrió un error al comunicarse con Claude.';
        }
      } catch (e) {
        console.log('Error al comunicarse con Claude:', e && e.stack ? e.stack : (e.message || e));
        respuestaClaude = 'Ocurrió un error al comunicarse con Claude.';
      }
      // Mostrar primero la respuesta de Claude
      console.log(`[Claude]: ${respuestaClaude}`);
      logInteraction('claude', respuestaClaude);
      messages.push({ role: 'assistant', content: respuestaClaude });
      // Mostrar también el error MCP como referencia
      console.log(`[MCP]: ${errMsg}`);
    }
    promptUser();
    return;
  }

  // Guarda en el log el mensaje del usuario
  logInteraction('user', input);
  messages.push({ role: 'user', content: input });

  // Envía el historial a Claude
  const respuesta = await sendMessageToClaude(messages);
  console.log(`[Claude]: ${respuesta}`);
  // Guarda en el log la respuesta de Claude
  logInteraction('claude', respuesta);
  // Agrega la respuesta de Claude al historial
  messages.push({ role: 'assistant', content: respuesta });
  promptUser();
}

function promptUser() {
  rl.question('> ', handleInput);
}

promptUser();
