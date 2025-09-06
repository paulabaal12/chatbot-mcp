// Punto de entrada del chatbot anfitrión

const readline = require('readline');
const { sendMessageToClaude } = require('./claude');
const { logInteraction, showLog } = require('./log');

// Historial de mensajes para mantener contexto
const messages = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Chatbot anfitrión iniciado. Escribe tu mensaje (Ctrl+C para salir):');

function promptUser() {
  rl.question('> ', async (input) => {
    // Agrega el mensaje del usuario al historial
    if (input.trim().toLowerCase() === 'historial') {
      showLog();
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
  });
}

promptUser();
