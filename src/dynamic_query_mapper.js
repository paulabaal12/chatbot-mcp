import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar todas las herramientas dinámicamente desde all_tools.json
let allTools = [];

function loadAllTools() {
    try {
        const toolsPath = path.join(__dirname, '..', 'config', 'all_tools.json');
        const toolsData = fs.readFileSync(toolsPath, 'utf8');
        allTools = JSON.parse(toolsData);
        // Log solo en casos necesarios - no en cada carga
        return allTools;
    } catch (error) {
        console.error('[ERROR] No se pudo cargar all_tools.json:', error.message);
        return [];
    }
}

/**
 * Encuentra la herramienta más apropiada usando Claude para análisis semántico dinámico
 */
export async function findToolForQuery(query, claudeClient, conversationHistory = []) {
    // Log detallado solo en session cuando sea necesario
    
    if (allTools.length === 0) {
        loadAllTools();
    }
    
    // Filtro para detectar preguntas generales y conceptuales
    const generalQuestions = /^(quien es|quién es|who is|cuando nació|cuándo nació|when was.*born|donde nació|dónde nació|where was.*born|cuando murió|cuándo murió|when did.*die|que es|qué es|what is|explica|explain|explicame|explícame|define|definition|definición)/i;
    if (generalQuestions.test(query.trim())) {
        return null; // No usar herramientas para preguntas generales
    }
    
    // Filtro adicional para conceptos técnicos y generales
    const conceptualKeywords = ['protocolo', 'formula 1', 'fórmula 1', 'inteligencia artificial', 'http', 'https', 'tcp', 'ip', 'dns', 'historia', 'geografia', 'geografía', 'ciencia', 'física', 'química', 'matemáticas', 'literatura', 'arte', 'música', 'deporte', 'deportes', 'filosofía', 'psicología', 'biología'];
    const hasConceptualKeywords = conceptualKeywords.some(keyword => 
        query.toLowerCase().includes(keyword.toLowerCase())
    );
    if (hasConceptualKeywords && (query.toLowerCase().includes('que es') || query.toLowerCase().includes('qué es') || query.toLowerCase().includes('what is') || query.toLowerCase().includes('explica') || query.toLowerCase().includes('explícame'))) {
        return null; // No usar herramientas para explicaciones conceptuales
    }
    
    // Crear un resumen compacto de herramientas para Claude
    const toolsSummary = allTools.map(tool => ({
        name: tool.name,
        description: tool.description || 'Sin descripción',
        mcp: tool.mcp,
        params: tool.input_schema?.required || []
    }));
    
    // Extraer contexto reciente de la conversación
    const recentHistory = conversationHistory.slice(-4); // Solo las últimas 2 interacciones
    const contextText = recentHistory.length > 0 ? 
        `\nCONTEXTO DE CONVERSACIÓN RECIENTE:\n${recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n` : '';
    
    const prompt = `Analiza esta consulta y selecciona la herramienta MAS APROPIADA:

            CONSULTA: "${query}"${contextText}

            HERRAMIENTAS DISPONIBLES:
            ${JSON.stringify(toolsSummary, null, 1)}

            REGLAS CRÍTICAS - NO USAR HERRAMIENTAS PARA:
            ❌ Preguntas sobre personas famosas: "quien es charles leclerc", "quien es alan turing"
            ❌ Fechas de nacimiento/muerte: "cuando nació", "cuando murió"  
            ❌ Biografías e información general de personas
            ❌ Preguntas de seguimiento biográficas
            ❌ Fechas históricas (solo usar get_time para hora actual del sistema)
            ❌ Explicaciones conceptuales: "que es HTTP", "explica la formula 1", "que es inteligencia artificial"
            ❌ Definiciones técnicas: "que es el protocolo HTTP", "explica TCP/IP"
            ❌ Conocimiento general: historia, ciencia, literatura, arte, deportes, etc.

            USAR HERRAMIENTAS SOLO PARA:
            ✅ Crear/leer archivos específicos
            ✅ Operaciones Git/GitHub específicas  
            ✅ Recetas con ingredientes específicos
            ✅ Taylor Swift lyrics (solo "taylor swift")
            ✅ Hora actual del sistema

            REGLAS DE SELECCIÓN:
            - "crea un archivo [nombre]" → usar "write_file" (NO create_directory)
            - "crea repositorio [nombre]" → usar "github_create_repo" para GitHub (SIEMPRE GitHub por defecto)
            - "crea un repositorio [nombre]" → usar "github_create_repo" para GitHub
            - "clona el repositorio [nombre]" → usar "git_clone" 
            - "crea una carpeta/directorio" → usar "create_directory"
            - "lee/lee archivo [path específico]" → usar "read_file" 
            - "commit/hacer commit" → usar "git_commit"
            - "push" o "haz push" → usar "git_push"
            - "receta con [ingrediente]" → usar "get_recipes_by_ingredients"
            - "receta [dieta]" → usar "suggest_recipe_by_diet"
            - "calorías/nutrición" → usar "get_food_by_name"
            - "taylor swift" → usar "taylor_lyric"
            - "¿qué hora es ahora?" o "hora actual" o "tiempo actual" → usar "get_time"

            IMPORTANTE: 
            - Para PREGUNTAS GENERALES → NO usar herramientas (retornar null):
            * "¿Quién es X?", "¿Quién fue X?", "quien es X", "quien fue X"
            * "¿Qué es Y?", "que es Y", "explica Y", "explícame Y"
            * "¿Cuándo nació X?", "cuando nació X", "when was X born"
            * "¿Dónde nació X?", "donde nació X"
            * "¿Cuándo murió X?", "cuando murió X"
            * Biografías, fechas históricas, información general de personas
            * Explicaciones de conceptos: "que es HTTP", "explica formula 1", "que es inteligencia artificial"
            * Definiciones técnicas: "protocolo HTTP", "TCP/IP", "DNS", etc.
            * Conocimiento general: historia, ciencia, literatura, arte, deportes
            - Para PREGUNTAS DE SEGUIMIENTO sobre personas → NO usar herramientas (retornar null):
            * "¿En qué fecha nació?", "¿Dónde nació?", "¿Cuándo murió?"
            * "cuando nació", "where was he born", "when did he die"
            - Para FECHAS HISTÓRICAS de personas → NO usar herramientas (retornar null)
            - Solo usar "get_time" para HORA/FECHA ACTUAL DEL SISTEMA, NO para fechas históricas
            - Si menciona nombres de personas famosas (atletas, científicos, etc.) → NO usar herramientas (retornar null)
            - Para "crea repositorio" SIN especificar "local" → SIEMPRE usar "github_create_repo"
            - Solo usar herramientas para ACCIONES ESPECÍFICAS (crear, leer archivos, git, recetas específicas)
            - Para crear ARCHIVOS usa "write_file", NO "create_directory"
            - Para crear CARPETAS usa "create_directory"
            - Para GitHub usa herramientas de "GithubMCP"
            - Para Git local usa herramientas de "GitMCP"

            RESPONDE EXACTAMENTE en este formato JSON:
            {
            "tool": "nombre_exacto_de_la_herramienta",
            "mcp": "nombre_exacto_del_mcp", 
            "confidence": 0.9
            }

            Si no hay herramienta apropiada:
            {
            "tool": null,
            "mcp": null,
            "confidence": 0.0
            }`;

    try {
        const response = await claudeClient.createMessage({
            model: 'claude-3-haiku-20240307',
            max_tokens: 300,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });
        
        const claudeResponse = response.content[0].text.trim();
        
        // Extraer JSON de la respuesta
        const jsonMatch = claudeResponse.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) {
            // el error solo se ve en log
            return null;
        }
        
        const result = JSON.parse(jsonMatch[0]);
        
        if (!result.tool || result.confidence < 0.6) {
            return null;
        }
        
        // Validar que la herramienta existe
        const toolExists = allTools.find(t => t.name === result.tool && t.mcp === result.mcp);
        if (!toolExists) {
            return null;
        }
        
        // Generar argumentos dinámicamente
        const args = await generateArgumentsForTool(query, toolExists, claudeClient);
        
        // Return clean result without debug logs
        return {
            tool: result.tool,
            mcp: result.mcp,
            args: args
        };
        
    } catch (error) {
        console.error('[ERROR] Error en selección dinámica:', error.message);
        return null;
    }
}

/**
 * Genera argumentos dinámicamente basándose en el esquema de la herramienta
 */
async function generateArgumentsForTool(query, tool, claudeClient) {
    // Si no tiene parámetros requeridos, devolver objeto vacío
    if (!tool.input_schema?.required || tool.input_schema.required.length === 0) {
        return {};
    }
    
    // Crear prompt específico para generar argumentos y no se arruine xdddd
    const schemaDescription = tool.input_schema.properties ? 
        Object.entries(tool.input_schema.properties).map(([key, value]) => 
            `${key}: ${value.description || value.type || 'parámetro'}`
        ).join(', ') : 'Sin descripción';
    
    const prompt = `Extrae los argumentos necesarios de esta consulta para la herramienta:

CONSULTA: "${query}"
HERRAMIENTA: ${tool.name}
DESCRIPCIÓN: ${tool.description}
PARÁMETROS REQUERIDOS: ${tool.input_schema.required.join(', ')}
ESQUEMA: ${schemaDescription}

EJEMPLOS POR HERRAMIENTA:
- write_file: "crea archivo test.txt" → {"path": "test.txt", "content": ""}
- git_clone: "clona repositorio prueba12" → {"repositoryUrl": "https://github.com/paulabaal12/prueba12", "targetPath": "D:/Documentos/GitHub/prueba12"}
- create_directory: "crea carpeta test" → {"path": "test"}
- read_file: "lee archivo test.txt" → {"path": "test.txt"}
- git_commit: "haz commit con mensaje 'Initial commit'" → {"message": "Initial commit"}
- git_commit: "haz commit en D:/Documentos/GitHub/test-demo con mensaje 'Add README'" → {"message": "Add README", "path": "D:/Documentos/GitHub/test-demo"}
- git_push: "haz push en D:/Documentos/GitHub/test-demo" → {"path": "D:/Documentos/GitHub/test-demo"}
- github_create_repo: "crea repositorio prueba12" → {"repoName": "prueba12"}
- github_create_repo: "crea repositorio testt" → {"repoName": "testt"}
- get_recipes_by_ingredients: "recipe with cheese" → {"ingredients": ["cheese"]}
- get_food_by_name: "calories apple" → {"name": "apple"}
- suggest_recipe_by_diet: "vegan recipe" → {"diet": "vegan"}
- suggest_recipe_by_diet: "keto recipe" → {"diet": "keto"}
- suggest_ingredient_substitution: "substitute rice" → {"ingredient": "rice"}
- get_recipes_by_ingredients: "recipe with apple, sugar" → {"ingredients": ["apple", "sugar"]}

REGLAS ESPECIALES:
- Para git_clone: siempre usar owner "paulabaal12" y targetPath en "D:/Documentos/GitHub/[nombre_repo]"
- Para write_file: si no hay contenido específico, usar content: ""
- Para git_commit: extraer path del directorio mencionado (ej: "en D:/Documentos/GitHub/test-demo")
- Para git_push: extraer path del directorio mencionado (ej: "en D:/Documentos/GitHub/test-demo")
- Para github_create_repo: usar "repoName" no "name"
- Para rutas: usar rutas absolutas cuando sea posible

Responde SOLO con el objeto JSON de argumentos:`;

    try {
        const response = await claudeClient.createMessage({
            model: 'claude-3-haiku-20240307',
            max_tokens: 150,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });
        
        const claudeResponse = response.content[0].text.trim();
        const jsonMatch = claudeResponse.match(/\{[\s\S]*?\}/);
        
        if (jsonMatch) {
            const args = JSON.parse(jsonMatch[0]);
            return args;
        }
        
        return {};
        
    } catch (error) {
        console.error('[ERROR] Error generando argumentos:', error.message);
        return {};
    }
}

// Mantener función de compatibilidad para el mapeo manual como fallback
export function findToolForQueryLegacy(query) {
    // Si hay problemas con Claude, usar mapeo básico
    const legacyMappings = {
        'taylor': { tool: 'taylor_lyric', mcp: 'RemoteMCP', args: {} },
        'time': { tool: 'get_time', mcp: 'RemoteMCP', args: {} },
        'lucky': { tool: 'lucky_number', mcp: 'RemoteMCP', args: {} },
        'recipe': { tool: 'get_recipes_by_ingredients', mcp: 'KitchenMCP', args: { ingredients: ['general'] } },
        'calories': { tool: 'get_food_by_name', mcp: 'KitchenMCP', args: { name: 'apple' } }
    };
    
    for (const [keyword, mapping] of Object.entries(legacyMappings)) {
        if (query.toLowerCase().includes(keyword)) {
            return mapping;
        }
    }
    
    return null;
}

// Cargar herramientas al inicializar
loadAllTools();

export { loadAllTools };