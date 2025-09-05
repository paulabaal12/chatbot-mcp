
//API de Claude (Anthropic)

const axios = require('axios');
require('dotenv').config({ path: './config/.env' });

const CLAUDE_API_KEY = process.env['ANTROPIC-KEY'];
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

async function sendMessageToClaude(messages) {
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
    return response.data.content[0].text;
  } catch (error) {
    console.error('Error al comunicarse con Claude:', error.response?.data || error.message);
    return 'Ocurrió un error al comunicarse con Claude.';
  }
}

module.exports = { sendMessageToClaude };
