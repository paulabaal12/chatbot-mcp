// Módulo para guardar logs de la conversación

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'session.log');

// Asegura que el directorio de logs existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

function logInteraction(role, content) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${role.toUpperCase()}]: ${content}\n`;
  fs.appendFileSync(LOG_FILE, logLine, 'utf8');
}

module.exports = { logInteraction };
