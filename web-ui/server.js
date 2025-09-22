import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Manejar conexiones WebSocket
io.on('connection', (socket) => {
  console.log('🔗 Usuario conectado:', socket.id);
  
  // Cuando el usuario envía un mensaje
  socket.on('user_message', async (data) => {
    const { message } = data;
    console.log('📝 Mensaje recibido:', message);
    
    // Emitir el mensaje del usuario
    socket.emit('message', {
      type: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });
    
    // Procesar con el chatbot MCP
    try {
      await processChatbotMessage(message, socket);
    } catch (error) {
      console.error('Error procesando mensaje:', error);
      socket.emit('message', {
        type: 'error',
        content: 'Lo siento, ocurrió un error procesando tu mensaje.',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Usuario desconectado:', socket.id);
  });
});

// Función para procesar mensajes con el chatbot MCP
async function processChatbotMessage(message, socket) {
  return new Promise((resolve, reject) => {
    // Usar el chatbot especializado para web
    const chatbot = spawn('node', ['src/web-chatbot.js', message], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let isProcessing = false;
    let fullResponse = '';
    
    // Enviar indicador de "escribiendo"
    socket.emit('typing', { isTyping: true });
    
    // Capturar salida del chatbot
    chatbot.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      fullResponse += text;
      
      console.log('Chatbot output:', text); // Debug log
      
      // Buscar respuestas del chatbot
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Filtrar líneas no deseadas
        if (trimmedLine.includes('dotenv@') || 
            trimmedLine.includes('injecting env') ||
            trimmedLine.includes('tip:') ||
            trimmedLine.includes('MCPs cargados') ||
            trimmedLine.includes('Sistema completamente') ||
            trimmedLine.includes('MCPs disponibles') ||
            trimmedLine.includes('• ') ||
            trimmedLine.length < 3) {
          continue;
        }
        
        // Detectar líneas importantes del chatbot
        if (trimmedLine.includes('[Claude') || 
            trimmedLine.includes('[Chatbot]') || 
            trimmedLine.includes('Ejecutando tool') ||
            trimmedLine.includes('Error') ||
            trimmedLine.includes('RemoteMCP') ||
            trimmedLine.includes('Resultado:') ||
            trimmedLine.includes('"title":') ||
            trimmedLine.includes('"lyric":') ||
            trimmedLine.includes('Entendido') ||
            trimmedLine.includes('Consulta:') ||
            trimmedLine.includes('Herramienta:')) {
          
          let cleanLine = trimmedLine.replace(/^\[.*?\]:\s*/, '').trim();
          
          // Formatear según el tipo de línea
          if (trimmedLine.includes('Ejecutando tool')) {
            cleanLine = `🔧 ${trimmedLine}`;
          } else if (trimmedLine.includes('Resultado:') || trimmedLine.includes('"title":')) {
            cleanLine = `📋 ${trimmedLine}`;
          }
          
          if (cleanLine && cleanLine.length > 0) {
            socket.emit('message', {
              type: 'assistant',
              content: cleanLine,
              timestamp: new Date().toISOString()
            });
            isProcessing = true;
          }
        }
      }
    });
    
    chatbot.stderr.on('data', (data) => {
      console.log('Chatbot stderr:', data.toString());
    });
    
    chatbot.on('close', (code) => {
      clearTimeout(timeout);
      console.log('Chatbot cerrado con código:', code); // Debug log
      socket.emit('typing', { isTyping: false });
      
      // Si no se procesó ninguna respuesta específica, procesar toda la salida
      if (!isProcessing && fullResponse.trim()) {
        console.log('Procesando respuesta completa...');
        const lines = fullResponse
          .split('\n')
          .map(line => line.trim())
          .filter(line => 
            line && 
            !line.includes('dotenv@') && 
            !line.includes('injecting env') &&
            !line.includes('tip:') &&
            !line.includes('>') &&
            !line.includes('[WARN]') &&
            !line.includes('MCPs inicializados') &&
            !line.includes('Procesando:') &&
            !line.includes('Buscando herramienta') &&
            !line.includes('Herramienta encontrada') &&
            !line.includes('Usando Claude') &&
            line.length > 5
          );
          
        // Buscar contenido importante en toda la respuesta
        let foundResponse = false;
        for (const line of lines) {
          if (line.includes('Claude') || 
              line.includes('Chatbot') ||
              line.includes('Ejecutando') ||
              line.includes('Resultado') ||
              line.includes('title') ||
              line.includes('lyric') ||
              line.includes('Entendido') ||
              line.includes('Consulta') ||
              line.includes('Error')) {
            
            socket.emit('message', {
              type: 'assistant',
              content: line,
              timestamp: new Date().toISOString()
            });
            foundResponse = true;
          }
        }
        
        // Si aún no hay respuesta pero hay contenido, enviar un resumen
        if (!foundResponse && lines.length > 0) {
          const summary = lines.slice(-3).join('\n'); // Últimas 3 líneas
          if (summary.length > 10) {
            socket.emit('message', {
              type: 'assistant',
              content: summary,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // Si no hay respuesta en absoluto
        if (!foundResponse && lines.length === 0) {
          socket.emit('message', {
            type: 'error',
            content: 'No se pudo procesar la solicitud. Por favor, intenta de nuevo.',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      resolve();
    });
    
    // Timeout de seguridad más largo para MCPs
    const timeout = setTimeout(() => {
      if (!isProcessing) {
        console.log('⚠️  Timeout alcanzado, terminando proceso del chatbot');
        chatbot.kill('SIGTERM');
        
        // Enviar mensaje de timeout al usuario
        socket.emit('message', {
          type: 'assistant',
          content: '⏱️ El procesamiento está tomando más tiempo del esperado. Por favor, intenta de nuevo.',
          timestamp: new Date().toISOString()
        });
        socket.emit('typing', { isTyping: false });
      }
    }, 30000); // 30 segundos timeout
    
    // Cleanup al finalizar
    chatbot.on('close', (code) => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor web ejecutándose en http://localhost:${PORT}`);
});