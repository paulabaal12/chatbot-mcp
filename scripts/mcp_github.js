#!/usr/bin/env node
import readline from 'readline';
import { deleteGithubRepo, createGithubRepo } from '../config/github_api.js';
import dotenv from 'dotenv';
dotenv.config({ path: './config/.env' });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

import { exec } from 'child_process';

const tools = [
  {
    name: 'github_create_repo',
    description: 'Create a new GitHub repository for the authenticated user. Requires repoName.',
    input_schema: {
      type: 'object',
      properties: {
        repoName: { type: 'string', description: 'Name of the repository to create' }
      },
      required: ['repoName'],
      additionalProperties: false
    },
    output_schema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        full_name: { type: 'string' },
        html_url: { type: 'string' },
        private: { type: 'boolean' }
      },
      required: ['id', 'name', 'full_name', 'html_url', 'private'],
      additionalProperties: true
    }
  },
  {
    name: 'github_delete_repo',
    description: 'Delete a GitHub repository for the authenticated user. Requires repoName and owner.',
    input_schema: {
      type: 'object',
      properties: {
        repoName: { type: 'string', description: 'Name of the repository to delete' },
        owner: { type: 'string', description: 'Owner of the repository (username or org)' }
      },
      required: ['repoName', 'owner'],
      additionalProperties: false
    },
    output_schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      },
      required: ['success', 'message'],
      additionalProperties: false
    }
  },
  {
    name: 'github_clone_repo',
    description: 'Clone a GitHub repository to a local path. Requires repoName, owner, and optional destPath.',
    input_schema: {
      type: 'object',
      properties: {
        repoName: { type: 'string', description: 'Name of the repository to clone' },
        owner: { type: 'string', description: 'Owner of the repository (username or org)' },
        destPath: { type: 'string', description: 'Destination path to clone into (optional)' }
      },
      required: ['repoName', 'owner'],
      additionalProperties: false
    },
    output_schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      },
      required: ['success', 'message'],
      additionalProperties: false
    }
  }
];


function sendRPC(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + '\n');
}

function sendError(id, error) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { message: error } }) + '\n');
}

rl.on('line', async (line) => {
  let req;
  try { req = JSON.parse(line); } catch (e) { return; }
  const id = req.id || null;
  if (req.method === 'tools/list') {
    sendRPC(id, { tools });
    return;
  }
  if (req.method === 'tools/call' && req.params) {
    const { name, arguments: args } = req.params;
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      sendError(id, 'Missing GITHUB_TOKEN in env');
      return;
    }
    if (name === 'github_create_repo') {
      const { repoName } = args || {};
      try {
        const result = await createGithubRepo(repoName, githubToken);
        sendRPC(id, result);
      } catch (err) {
        sendError(id, String(err));
      }
      return;
    }
    if (name === 'github_delete_repo') {
      const { repoName, owner } = args || {};
      try {
        const result = await deleteGithubRepo(repoName, githubToken, owner);
        sendRPC(id, result);
      } catch (err) {
        sendRPC(id, { success: false, message: String(err) });
      }
      return;
    }
    if (name === 'github_clone_repo') {
      let { repoName, owner, destPath } = args || {};
      if (!repoName) {
        sendRPC(id, { success: false, message: 'repoName is required' });
        return;
      }
      if (!owner) {
        owner = process.env.GITHUB_OWNER || 'paulabaal12';
      }
      const repoUrl = `https://github.com/${owner}/${repoName}.git`;
      const cloneCmd = destPath ? `git clone ${repoUrl} "${destPath.replace(/\\/g, '/')}"` : `git clone ${repoUrl}`;
      exec(cloneCmd, (err, stdout, stderr) => {
        if (err) {
          sendRPC(id, { success: false, message: stderr || String(err) });
        } else {
          sendRPC(id, { success: true, message: `Cloned to ${destPath || './'}` });
        }
      });
      return;
    }
  }
  // Opcional: responder a initialize para compatibilidad
  if (req.method === 'initialize') {
    sendRPC(id, { ok: true });
    return;
  }
  sendError(id, 'Unknown request');
});
