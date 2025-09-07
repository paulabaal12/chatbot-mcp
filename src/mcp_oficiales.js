
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { MCPStdioClient } from './mcp_clients.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findNpx() {
  // Forzar siempre 'npx.cmd' para compatibilidad con Windows/PowerShell
  return 'npx.cmd';
}

export async function crearRepositorio(nombre, readmeText, commitMsg) {
  if (!/^[\w-]+$/.test(nombre)) throw new Error('Nombre de repositorio inválido.');

  const npxCmd = findNpx();
  const baseDir = 'D:/Documentos/GitHub';
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  const repoPath = path.join(baseDir, nombre);

  const fsClient = new MCPStdioClient(npxCmd, ['-y', '@modelcontextprotocol/server-filesystem', baseDir]);
  const gitClient = new MCPStdioClient(npxCmd, ['-y', '@cyanheads/git-mcp-server']);

  try {
    await fsClient.callTool('create_directory', { path: repoPath });
    await fsClient.callTool('write_file', {
      path: path.join(repoPath, 'README.md'),
      content: readmeText || `# ${nombre}\n\nRepositorio creado por el chatbot usando MCP.\n`
    });

  await gitClient.callTool('git_set_working_dir', { path: repoPath });
  await gitClient.callTool('git_init', { path: repoPath });
  await gitClient.callTool('git_add', { path: repoPath, paths: ['README.md'] });
  await gitClient.callTool('git_commit', { path: repoPath, message: commitMsg || 'feat: add README' });

  await gitClient.callTool('git_status', { path: repoPath });
  return `Repositorio '${nombre}' creado correctamente`;
  } finally {
    fsClient.close();
    gitClient.close();
  }
}

export async function crearRepositorioRemoto(nombre, usuarioGitHub) {
  if (!/^[\w-]+$/.test(nombre)) throw new Error('Nombre de repositorio inválido.');
  if (!/^[\w-]+$/.test(usuarioGitHub)) throw new Error('Usuario de GitHub inválido.');

  const baseDir = 'D:/Documentos/GitHub';
  const repoPath = path.resolve(baseDir, nombre);
  const remoteSlug = `${usuarioGitHub}/${nombre}`;

  // Helper para ejecutar comandos y esperar resultado
  function execPromise(cmd, opts) {
    return new Promise((resolve, reject) => {
      exec(cmd, { ...opts, shell: true }, (error, stdout, stderr) => {
        if (error) reject({ error, stdout, stderr });
        else resolve({ stdout, stderr });
      });
    });
  }

  // 1. Intenta crear el repo remoto y pushear
  try {
    const { stdout, stderr } = await execPromise(
      `gh repo create ${remoteSlug} --private --source "${repoPath}" --remote origin --push --confirm`,
      { cwd: repoPath, timeout: 120000 }
    );
    // Si el remote no se pudo agregar, forzamos el remote y el push
    if (stderr && stderr.includes('Unable to add remote')) {
      // Forzar remote y push manual
      await execPromise(`git remote add origin https://github.com/${remoteSlug}.git`, { cwd: repoPath });
      await execPromise(`git push -u origin main`, { cwd: repoPath });
      return `Repositorio remoto creado y pusheado manualmente: https://github.com/${remoteSlug}\n${stdout}\n${stderr}`;
    }
    return `Repositorio remoto creado: https://github.com/${remoteSlug}\n${stdout}\n${stderr}`;
  } catch (err) {
    // Si el error es por remote existente, intenta solo el push
    if (err.stderr && err.stderr.includes('remote origin already exists')) {
      try {
        await execPromise(`git push -u origin main`, { cwd: repoPath });
        return `Repositorio remoto ya existía, pero se hizo push manualmente: https://github.com/${remoteSlug}`;
      } catch (pushErr) {
        throw new Error(`Error al hacer push manual: ${pushErr.error?.message || pushErr}`);
      }
    }
    throw new Error(`Error al crear remoto: ${err.error?.message || err}\nSTDOUT: ${err.stdout}\nSTDERR: ${err.stderr}`);
  }
}

export async function crearRepositorioConReadme(nombre, readmeText, commitMsg) {
  return crearRepositorio(nombre, readmeText, commitMsg);
}
