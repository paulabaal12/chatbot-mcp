# MCP Chatbot - Dynamic Model Context Protocol Implementation

A sophisticated console-based chatbot that implements the Model Context Protocol (MCP) with dynamic tool selection and multiple server integrations. Built as part of a computer networks protocol implementation project.

## 🚀 Features

### Core Functionality
- **Direct MCP Integration**: Native Model Context Protocol implementation without Claude API dependencies
- **Context Management**: Maintains conversation context across multiple interactions
- **Comprehensive Logging**: Detailed session logs for all MCP interactions and responses
- **Dynamic Tool Selection**: Intelligent tool selection based on natural language analysis

### MCP Server Support
- **8 MCP Servers**: 69+ tools available across multiple domains
- **Local Official Servers**: Filesystem and Git operations
- **Custom Local Servers**: Kitchen/Recipe functionality, Filesystem Delete operations
- **Remote Server**: Cloudflare Workers deployment with Taylor Swift lyrics
- **Third-party Integration**: External student servers (Transfermarkt, SleepCoach)

### Advanced Features
- **Intelligent Automation**: Automatic Git workflow management
- **Rate Limiting**: Built-in protection against API limits
- **Error Recovery**: Automatic reconnection and retry mechanisms
- **Real-time Processing**: Live tool execution with progress indicators

## 📦 Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Natural Lang   │    │   MCP Chatbot    │    │  MCP Servers    │
│  Processing     │◄──►│   (Client)       │◄──►│  (Tools)        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │ Dynamic Query    │
                       │ Mapper           │
                       └──────────────────┘
```

## 🛠️ Installation

### Prerequisites
- **Node.js** 18+ 
- **Git** (for version control operations)
- **GitHub Token** (for repository operations)
- **MCP Servers** (automatically installed or configured)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/paulabaal12/chatbot-mcp.git
cd chatbot-mcp
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment variables:**

Create `config/.env` file:
```env
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=your_github_username
```

4. **Install MCP servers:**
```bash
# Official Filesystem MCP
npm install -g @modelcontextprotocol/server-filesystem

# Official Git MCP  
npm install -g @cyanheads/git-mcp-server

# Additional dependencies will be installed automatically
```

## 🚀 Usage

### Starting the Chatbot

```bash
node src/index.js
```

You'll see the startup information:
```
🤖 Chatbot MCP con Sistema Dinámico
📦 8 MCPs cargados con 69 herramientas disponibles
🔧 MCPs disponibles:
  • FilesystemMCP: 14 tools
  • GitMCP: 25 tools
  • GithubMCP: 3 tools
  • KitchenMCP: 11 tools
  • FilesystemDeleteMCP: 1 tools
  • RemoteMCP: 4 tools
  • TransfermarktMCP: 6 tools
  • SleepCoachMCP: 5 tools

🎉 Escribe tu consulta o 'exit' para salir.
💡 Comandos especiales: 'log' para ver historial, 'exit' para salir
```

### Example Commands

#### General Questions (Direct to Claude)
```
> Who was Alan Turing?
[Claude]: Alan Turing was a British mathematician, computer scientist...

> When was he born?
[Claude]: Alan Turing was born on June 23, 1912 in London, United Kingdom.
```

#### File Operations (Filesystem MCP)
```
> crea un archivo hola.txt en D:\Documentos\Universidad\OCTAVO SEMESTRE\REDES
🔧 [Chatbot]: Ejecutando tool write_file en FilesystemMCP...
🤖 [FilesystemMCP]: Successfully wrote to D:\Documentos\Universidad\OCTAVO SEMESTRE\REDES\hola.txt

> read file test.txt  
🔧 [Chatbot]: Ejecutando tool read_text_file en FilesystemMCP...
🤖 [FilesystemMCP]: Hello MCP
```

#### Git Operations (Git MCP + GitHub MCP)
```
> create repository mcp-demo
[Chatbot]: Executing tool github_create_repo in GithubMCP...
[Claude + GithubMCP]: Repository created: https://github.com/paulabaal12/mcp-demo

> clone repository mcp-demo to D:/Documentos/GitHub
[Chatbot]: Executing tool git_clone in GitMCP...
[Claude + GitMCP]: Repository cloned successfully

> commit in D:/Documentos/GitHub/mcp-demo with message "Initial commit"
[Git Automation]: Setting working directory: D:/Documentos/GitHub/mcp-demo
[Git Automation]: git_add executed successfully
[Claude + GitMCP]: Commit successful
```

#### Recipe Suggestions (Kitchen MCP)
```
> Necesito un sustituto de arroz
🔧 [Chatbot]: Ejecutando tool suggest_ingredient_substitution en KitchenMCP...
🥗 [KitchenMCP]: ¡Perfecto! Entiendo que estás buscando un sustituto para el arroz. Aquí te comparto algunas opciones interesantes que podrían funcionar: puedes probar el cebada perlada cocida, el aceite de salvado de arroz, la quinoa cruda o el arroz silvestre sin cocinar. Cualquiera de estas alternativas sería una excelente opción para reemplazar el arroz en tus recetas. ¿Qué te parece? ¡Espero que encuentres la que mejor se ajuste a tus necesidades!

> Que utensilios de cocina necesito para cocinar lasaña
🔧 [Chatbot]: Ejecutando tool suggest_utensils_for_recipe en KitchenMCP...
🥗 [KitchenMCP]: ¡Claro, con gusto te comparto los utensilios que necesitarás para preparar una deliciosa lasaña! Aquí tienes una lista de lo básico: una tabla de cortar, un cuchillo, un cucharón, un tenedor, algunos recipientes, una olla, una sartén, un colador, tazas y cucharas para medir, bowls para mezclar, una batidora, una espátula, unas pinzas, guantes de horno, un pelador y una ralladora. ¡Todo lo que necesitas para cocinar una lasaña casera y llena de sabor! Avísame si necesitas algo más.
```

#### Remote Server (Taylor Swift Lyrics & Time)
```
> taylor swift lyric
🔧 [Chatbot]: Ejecutando tool taylor_lyric en RemoteMCP...
🌐 [RemoteMCP]: ¡Perfecto, aquí tienes la letra de la canción "Getaway Car" de Taylor Swift!

"Cause us traitors never win" es una de las frases clave de esta canción. Te comparto este fragmento de la letra para que puedas disfrutar de la melodía y las letras de Taylor. ¡Espero que lo disfrutes!

> que horas son
🔧 [Chatbot]: Ejecutando tool get_time en RemoteMCP...
🌐 [RemoteMCP]: ¡Aquí tienes! Son las 2:43 a.m. hora UTC. Te comparto que la hora actual es las 2:43 de la madrugada. Perfecto, espero que esta información sea útil para ti.
```

#### View Session Logs
```
> log
[Shows complete interaction history with timestamps]
```

#### Exit
```
> exit
```

## 🔧 Configuration

### MCP Servers Configuration (`config/servers.json`)

```json
[
  {
    "name": "FilesystemMCP",
    "type": "stdio", 
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:/Documentos"],
    "cwd": "D:/Documentos"
  },
  {
    "name": "GitMCP",
    "type": "stdio",
    "command": "npx", 
    "args": ["-y", "@cyanheads/git-mcp-server", "D:/Documentos"],
    "cwd": "D:/Documentos"
  },
  {
    "name": "RemoteMCP",
    "type": "http",
    "url": "https://mcp-remote.paulabarillas.workers.dev"
  }
]
```

### Dynamic Tool Selection

The system uses Claude to analyze user input and automatically select the most appropriate tool:

- **Natural Language Processing**: Understands intent from user queries
- **Semantic Mapping**: Maps queries to available MCP tools
- **Context Awareness**: Maintains conversation context for follow-up questions
- **Automatic Argument Generation**: Creates proper arguments for tool calls

## 📊 Available Tools

### Local Official Servers
- **FilesystemMCP** (14 tools): File operations, directory management
- **GitMCP** (25 tools): Complete Git workflow, repository management

### Custom Servers  
- **GithubMCP** (3 tools): GitHub repository creation and management
- **KitchenMCP** (11 tools): Recipe suggestions, nutritional information, cooking utensils
- **FilesystemDeleteMCP** (1 tool): Advanced file deletion operations

### Remote Servers
- **RemoteMCP** (4 tools): Time utilities, random generators, Taylor Swift lyrics

### Third-party Servers
- **TransfermarktMCP** (6 tools): Football/soccer statistics and information  
- **SleepCoachMCP** (5 tools): Sleep tracking and wellness coaching

## 🔍 Troubleshooting

### Common Issues

1. **"No session working directory set"**
   - The Git MCP requires working directory setup for operations
   - Use: `git_set_working_dir in D:/path/to/repo` before Git commands

2. **Rate limiting errors**
   - The system includes automatic rate limiting protection
   - Wait for the suggested time period before retrying

3. **MCP server connection failures**
   - Check that all required packages are installed globally
   - Verify paths in `config/servers.json` are correct
   - Review logs for specific error messages

### Logs and Debugging

- **Session logs**: Stored in `logs/session.log`
- **Debug information**: Available via `log` command
- **Console output**: Real-time feedback during execution

## 🏗️ Technical Implementation

### Core Components

1. **Dynamic Query Mapper** (`src/dynamic_query_mapper.js`)
   - AI-powered tool selection using Claude
   - Semantic analysis of user input
   - Automatic argument generation

2. **MCP Client Manager** (`src/mcp_clients.js`)
   - Multiple MCP server connections
   - Connection pooling and management
   - Error handling and reconnection

3. **Claude Integration** (`src/claude.js`)
   - Direct API communication
   - Context management
   - Response interpretation

4. **Automation Engine** (`src/index.js`)
   - Git workflow automation
   - Error recovery mechanisms
   - Rate limiting protection

### Protocol Compliance

- **JSON-RPC 2.0**: Full compliance with MCP specification
- **WebSocket Support**: For real-time server communication
- **HTTP Integration**: Remote server compatibility (Cloudflare Workers)
- **stdio Integration**: Local process communication for custom servers
- **Error Handling**: Robust error recovery and reporting

### Custom Server Development

The project includes the development of a **Kitchen MCP Server** that demonstrates:

- **MCP Protocol Implementation**: Full JSON-RPC 2.0 specification compliance
- **Tool Schema Definition**: Proper input/output schema validation
- **Resource Management**: Efficient data handling and caching
- **Error Response Handling**: Standardized error codes and messages
- **Parameter Validation**: Strict input validation and sanitization

#### Server Architecture:
```javascript
// Example tool implementation
{
  "name": "get_recipes_by_ingredients",
  "description": "Find recipes based on available ingredients",
  "inputSchema": {
    "type": "object",
    "properties": {
      "ingredients": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["ingredients"]
  }
}
```

## 🌐 Remote MCP Server Implementation

### MCP Remote Server (Cloudflare Workers)

This project includes a remote MCP server deployed on Cloudflare Workers, demonstrating cloud-based MCP protocol implementation with global accessibility.

#### Deployment Information:
- **Live URL**: https://mcp-remote.paulabarillas.workers.dev
- **Platform**: Cloudflare Workers (Edge Computing)
- **Transport Protocol**: HTTP/HTTPS
- **Geographic Distribution**: Global edge network

#### Supported Methods:
- **`tools/list`**: Returns available tools list
- **`get_time`**: Current time in UTC or specified timezone
- **`lucky_number`**: Random number generator (1-100)
- **`taylor_lyric`**: Random song lyrics from music database

#### HTTP API Interface:
```json
POST / HTTP/1.1
Host: mcp-remote.paulabarillas.workers.dev
Content-Type: application/json

{
  "method": "get_time",
  "params": { "tz": "America/Guatemala" }
}
```

#### Example Response:
```json
{
  "timezone": "America/Guatemala",
  "time": "9/22/2025, 10:15:00"
}
```

#### Deployment Process:
```bash
# Initialize Cloudflare Workers project
wrangler init mcp-remote-server

# Deploy to global edge network
wrangler deploy
```

#### Example Deployment Output:
```
Total Upload: 2.78 KiB / gzip: 0.97 KiB
Uploaded mcp-remote (3.06 sec)
Deployed mcp-remote triggers (0.56 sec)
  https://mcp-remote.paulabarillas.workers.dev
Current Version ID: c65a1eef-c533-4d4f-9011-5cdeb946194f
```
