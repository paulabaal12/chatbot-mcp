import axios from "axios";

export class ClaudeClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.anthropic.com/v1/messages";
  }

  async sendMessage(prompt, history = [], maxTokens = 1000) {
    try {
      // Detect language from the prompt
      const language = this.detectLanguage(prompt);
      
      // Add language context to the system message if not already present
      let messages = [...history, { role: "user", content: prompt }];
      
      // Add system instruction for language consistency
      if (messages.length === 1 || !messages.some(m => m.role === 'system')) {
        const systemMessage = language === 'en' ? 
          "Please respond in English, matching the user's language." :
          "Por favor responde en español, manteniendo el idioma del usuario.";
        
        messages = [{ role: "system", content: systemMessage }, ...messages];
      }
      
      const res = await axios.post(
        this.baseUrl,
        {
          model: "claude-3-haiku-20240307",
          max_tokens: maxTokens,
          messages: messages
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
      // Manejar errores de rate limiting con detección de idioma
      const language = this.detectLanguage(prompt || "");
      const errorMessage = language === 'en' ? 
        "Rate limit reached. Wait a moment and try again." :
        "Rate limit alcanzado. Espera un momento e intenta de nuevo.";
      
      if (error.response?.status === 429) {
        throw new Error(errorMessage);
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

  // Detect the language of the user query
  detectLanguage(text) {
    // Simple language detection based on common patterns
    const englishPatterns = /\b(the|and|are|you|this|that|what|how|when|where|why|can|will|would|should|could|i'm|im|sad|happy|eat|food|recipe|time|help|please|thank|thanks)\b/i;
    const spanishPatterns = /\b(el|la|los|las|y|son|eres|esto|eso|que|qué|como|cómo|cuando|cuándo|donde|dónde|por qué|puedo|será|debería|podría|estoy|triste|feliz|comer|comida|receta|tiempo|ayuda|por favor|gracias)\b/i;
    
    const englishMatches = (text.match(englishPatterns) || []).length;
    const spanishMatches = (text.match(spanishPatterns) || []).length;
    
    // If more English patterns found, assume English
    if (englishMatches > spanishMatches) {
      return 'en';
    }
    // Default to Spanish if unclear or more Spanish patterns
    return 'es';
  }

  // Método especializado para interpretar respuestas de MCPs dinámicamente
  async interpretMCPResponse(toolName, mcpName, result, userQuery) {
    // Detect user's language
    const language = this.detectLanguage(userQuery);
    
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
    // Create language-specific prompt
    const prompt = language === 'en' ? 
      `Present this data in a clear and useful way for the user. You can say something like Hello and respond:

Query: ${userQuery}
Result: ${JSON.stringify(result, null, 2)}

Respond in a direct and friendly manner in English.` :
      `Presenta estos datos de forma clara y útil para el usuario. Puedes decirle algo como Hola y responder:

Consulta: ${userQuery}
Resultado: ${JSON.stringify(result, null, 2)}

Responde de forma directa y amigable en español.`;

    return this.sendMessage(prompt, [], 800);
  }
}