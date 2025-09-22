import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

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

// Almacenar historial de conversación por usuario
const userSessions = new Map();

// Manejar conexiones WebSocket
io.on('connection', (socket) => {
  console.log('🔗 Usuario conectado:', socket.id);
  
  // Inicializar sesión del usuario
  userSessions.set(socket.id, []);
  
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
    // Limpiar sesión del usuario
    userSessions.delete(socket.id);
  });
});

// Función para procesar mensajes con el chatbot MCP
async function processChatbotMessage(message, socket) {
  return new Promise((resolve, reject) => {
    // Obtener historial de conversación del usuario
    const userHistory = userSessions.get(socket.id) || [];
    
    // Crear archivo temporal con el historial para pasarlo al chatbot
    const tempHistoryFile = `temp_history_${socket.id}.json`;
    
    try {
      fs.writeFileSync(tempHistoryFile, JSON.stringify(userHistory));
    } catch (err) {
      console.error('Error escribiendo historial temporal:', err);
    }
    
    // Usar el chatbot especializado para web con historial
    const chatbot = spawn('node', ['src/web-chatbot.js', message, tempHistoryFile], {
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
      
      // Capturar todas las respuestas de Claude de forma inteligente
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Detectar respuestas de Claude + MCP
        if (trimmedLine.startsWith('[Claude + ')) {
          const mcpMatch = trimmedLine.match(/\[Claude \+ ([^\]]+)\]:\s*(.+)/);
          if (mcpMatch) {
            const mcpName = mcpMatch[1];
            const response = mcpMatch[2];
            
            // Formatear según el tipo de MCP
            let formattedResponse = '';
            
            if (mcpName.includes('RemoteMCP') && (response.includes('Título:') || response.includes('Letra:'))) {
              // Formato especial para letras de Taylor Swift
              const titleMatch = response.match(/Título:\s*["']?([^"'\n]+)["']?/i);
              const lyricMatch = response.match(/Letra:\s*["']?([^"'\n]+)["']?/i);
              
              if (titleMatch) {
                formattedResponse += `<div class="lyric-title"> <strong>${titleMatch[1]}</strong></div>`;
              }
              if (lyricMatch && !lyricMatch[1].includes('no disponible')) {
                formattedResponse += `<div class="lyric-text">${lyricMatch[1]}</div>`;
              }
            } else if (mcpName.includes('KitchenMCP')) {
              // Formatear respuestas de cocina
              try {
                const jsonResponse = JSON.parse(response);
                if (jsonResponse.substitutions) {
                  formattedResponse = `<div class="kitchen-response">
                    <div class="ingredient-title">🍽️ <strong>Sustitutos para: ${jsonResponse.ingredient}</strong></div>
                    <div class="substitutions-list">
                      ${jsonResponse.substitutions.map(sub => `<div class="substitution-item">• ${sub}</div>`).join('')}
                    </div>
                  </div>`;
                } else if (Array.isArray(jsonResponse)) {
                  formattedResponse = `<div class="recipes-response">
                    <div class="recipes-title">🍳 <strong>Recetas encontradas:</strong></div>
                    <div class="recipes-list">
                      ${jsonResponse.slice(0, 3).map(recipe => `
                        <div class="recipe-item">
                          <strong>${recipe.title}</strong>
                          <div class="recipe-description">${recipe.description || 'Receta deliciosa'}</div>
                        </div>
                      `).join('')}
                    </div>
                  </div>`;
                } else {
                  formattedResponse = `<div class="kitchen-simple">${response}</div>`;
                }
              } catch (e) {
                formattedResponse = `<div class="kitchen-simple">🍽️ ${response}</div>`;
              }
            } else {
              // Formato general para otros MCPs
              formattedResponse = `<div class="mcp-response">
                <div class="mcp-header">🔧 <strong>${mcpName}</strong></div>
                <div class="mcp-content">${response}</div>
              </div>`;
            }
            
            if (formattedResponse) {
              socket.emit('message', {
                type: 'assistant',
                content: formattedResponse,
                timestamp: new Date().toISOString()
              });
              isProcessing = true;
            }
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
      
      // Actualizar historial de conversación
      const userHistory = userSessions.get(socket.id) || [];
      userHistory.push({ role: "user", content: message });
      
      // Aquí deberíamos obtener la respuesta del chatbot, pero por simplicidad
      // mantenemos el historial básico por ahora
      userSessions.set(socket.id, userHistory.slice(-10)); // Mantener solo últimas 10 interacciones
      
      // Limpiar archivo temporal
      try {
        fs.unlinkSync(tempHistoryFile);
      } catch (err) {
        // Ignorar errores de limpieza
      }
      
      resolve();
    });
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor web ejecutándose en http://localhost:${PORT}`);
});