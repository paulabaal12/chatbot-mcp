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

function showLog() {
  if (fs.existsSync(LOG_FILE)) {
    const data = fs.readFileSync(LOG_FILE, 'utf8');
    console.log('\n--- Historial de la conversación ---');
    console.log(data);
    console.log('--- Fin del historial ---\n');
  } else {
    console.log('No hay historial de conversación.');
  }
}

module.exports = { logInteraction, showLog };
