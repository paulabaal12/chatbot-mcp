#!/usr/bin/env node
import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const tools = [
  {
    name: 'delete_file',
    description: 'Delete a file at the given absolute or allowed relative path.',
    input_schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or allowed relative path to the file to delete' }
      },
      required: ['filePath'],
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
  if (req.method === 'tools/call' && req.params && req.params.name === 'delete_file') {
    const { filePath } = req.params.arguments || {};
    if (!filePath) {
      sendError(id, 'Missing filePath');
      return;
    }
    try {
      await fs.unlink(path.resolve(filePath));
      sendRPC(id, { success: true, message: `File ${filePath} deleted.` });
    } catch (err) {
      sendRPC(id, { success: false, message: String(err) });
    }
    return;
  }
  if (req.method === 'initialize') {
    sendRPC(id, { ok: true });
    return;
  }
  sendError(id, 'Unknown request');
});
