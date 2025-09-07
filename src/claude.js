
// API de Claude (Anthropic) - ES Modules
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../config/.env') });

const CLAUDE_API_KEY = process.env['ANTROPIC-KEY'];
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

export async function sendMessageToClaude(messages) {
  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: 'claude-3-haiku-20240307',
        max_tokens: 512,
        messages: messages,
      },
      {
        headers: {
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );
    // Manejo robusto: si la respuesta no tiene el formato esperado, devuelve el string completo o un mensaje de error legible
    if (response.data && Array.isArray(response.data.content) && response.data.content[0] && typeof response.data.content[0].text === 'string') {
      return response.data.content[0].text;
    } else if (typeof response.data === 'string') {
      return response.data;
    } else if (response.data && typeof response.data === 'object') {
      return JSON.stringify(response.data);
    } else {
      return 'Ocurrió un error inesperado al procesar la respuesta de Claude.';
    }
  } catch (error) {
    console.error('Error al comunicarse con Claude:', error.response?.data || error.message);
    return 'Ocurrió un error al comunicarse con Claude.';
  }
}
