import axios from "axios";

export class ClaudeClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.anthropic.com/v1/messages";
  }

  async sendMessage(prompt, history = [], maxTokens = 1000) {
    try {
      const res = await axios.post(
        this.baseUrl,
        {
          model: "claude-3-haiku-20240307",
          max_tokens: maxTokens,
          messages: [...history, { role: "user", content: prompt }]
        },
        {
          headers: {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          timeout: 30000 // 30 segundos de timeout
        }
      );
      return res.data;
    } catch (error) {
      // Manejar errores de rate limiting
      if (error.response?.status === 429) {
        throw new Error("Rate limit alcanzado. Espera un momento e intenta de nuevo.");
      }
      throw error;
    }
  }

  // Método para crear mensajes directamente (usado por dynamic_mapper)
  async createMessage({ model, max_tokens, messages }) {
    try {
      const res = await axios.post(
        this.baseUrl,
        {
          model,
          max_tokens,
          messages
        },
        {
          headers: {
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          timeout: 30000
        }
      );
      return res.data;
    } catch (error) {
      if (error.response?.status === 429) {
        throw new Error("Rate limit alcanzado. Espera un momento e intenta de nuevo.");
      }
      throw error;
    }
  }

  // Método especializado para interpretar respuestas de MCPs dinámicamente
  async interpretMCPResponse(toolName, mcpName, result, userQuery) {
    // Para la mayoría de casos, mostrar el resultado directamente
    if (result && typeof result === 'object' && result.content) {
      // Si el MCP devuelve content estructurado, extraer el texto
      const textContent = result.content[0]?.text || JSON.stringify(result, null, 2);
      return {
        content: [{ text: textContent }]
      };
    }
    
    // Para resultados simples o estructurados, formatear de manera amigable
    if (result && typeof result === 'object') {
      // Si es un objeto simple con propiedades reconocibles
      if (Object.keys(result).length <= 5) {
        let formattedText = '';
        for (const [key, value] of Object.entries(result)) {
          if (value && typeof value === 'string') {
            formattedText += `**${key.charAt(0).toUpperCase() + key.slice(1)}:** ${value}\n\n`;
          }
        }
        if (formattedText) {
          return {
            content: [{ text: formattedText.trim() }]
          };
        }
      }
    }
    
    // Para resultados que ya son texto
    if (typeof result === 'string') {
      return {
        content: [{ text: result }]
      };
    }
    
    // Usar Claude solo como último recurso para casos complejos
    const prompt = `Presenta estos datos de forma clara y útil para el usuario,Puedes decirle algo como Hola, y responder o algo :

Consulta: ${userQuery}
Resultado: ${JSON.stringify(result, null, 2)}

Responde de forma directa y amigable.`;

    return this.sendMessage(prompt, [], 800);
  }
}