import axios from "axios";

export class ClaudeClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.anthropic.com/v1/messages";
  }

  async sendMessage(prompt, history = []) {
    const res = await axios.post(
      this.baseUrl,
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [...history, { role: "user", content: prompt }]
      },
      {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        }
      }
    );
    return res.data;
  }
}
