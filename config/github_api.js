import fetch from 'node-fetch';

export async function createGithubRepo(repoName, githubToken) {
  const url = 'https://api.github.com/user/repos';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'chatbot-mcp'
    },
    body: JSON.stringify({
      name: repoName,
      auto_init: true,
      private: false
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${err}`);
  }
  return res.json();
}

// Elimina un repositorio de GitHub del usuario autenticado
export async function deleteGithubRepo(repoName, githubToken, owner) {
  if (!owner) throw new Error('Se requiere el nombre del owner/usuario para eliminar el repo');
  const url = `https://api.github.com/repos/${owner}/${repoName}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'chatbot-mcp'
    }
  });
  if (res.status === 204) {
    return { success: true, message: `Repositorio ${repoName} eliminado correctamente.` };
  } else {
    const err = await res.text();
    throw new Error(`GitHub API error: ${res.status} ${err}`);
  }
}
