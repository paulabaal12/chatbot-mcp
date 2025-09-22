# MCP Chatbot Web UI

Web interface for the MCP (Model Context Protocol) Chatbot

## Features

- 🎨 Modern UI with cool colors (blues, teals, purples)
- 💬 Real-time chat interface with Socket.IO
- 🤖 Professional design inspired by Claude AI
- 📱 Responsive design for all devices
- 🔧 Integration with 8 MCP servers
- ⚡ Fast and smooth animations
- 🛠️ Live tool status indicators

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start the web server:
```bash
npm start
```

3. Open your browser and go to: `http://localhost:3000`

## Architecture

- **Frontend**: Vanilla JavaScript with Socket.IO for real-time communication
- **Backend**: Express.js server with WebSocket support
- **Integration**: Connects to existing MCP chatbot in `../src/index.js`
- **Design**: Modern CSS with cool color palette and smooth animations

## Available MCP Tools

The web UI provides access to all MCP servers:
- 📁 **Filesystem MCP** - File operations
- 🔧 **Git MCP** - Repository management  
- 🐙 **GitHub MCP** - GitHub API integration
- 🍳 **Kitchen MCP** - Cooking assistance
- ☁️ **Remote MCP** - Cloudflare Workers
- ⚽ **Transfermarkt MCP** - Sports data
- 😴 **Sleep Coach MCP** - Sleep optimization

## Color Palette

The UI uses a professional cool color scheme:
- Primary: Blues (#2563eb, #3b82f6)
- Secondary: Teals (#0891b2, #0ea5e9) 
- Accent: Purples (#7c3aed, #8b5cf6)
- Neutrals: Cool grays (#f8fafc to #0f172a)

## Scripts

- `npm start` - Start the web server
- `npm run dev` - Start with auto-reload (if nodemon is installed)

## Project Structure

```
web-ui/
├── package.json          # Dependencies and scripts
├── server.js            # Express server with Socket.IO
└── public/
    ├── index.html       # Main HTML interface
    ├── styles.css       # Cool color palette CSS
    └── script.js        # Frontend JavaScript logic
```

## Integration

The web UI integrates seamlessly with the existing MCP chatbot by:
1. Spawning the console chatbot process (`../src/index.js`)
2. Capturing stdout/stderr for responses
3. Providing real-time communication via WebSockets
4. Maintaining language detection and tool mapping
