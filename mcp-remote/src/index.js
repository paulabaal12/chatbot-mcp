/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx) {
		if (request.method === 'GET') {
			const html = `<!DOCTYPE html>
	<html lang="en">
	<head>
	  <meta charset="UTF-8">
	  <meta name="viewport" content="width=device-width, initial-scale=1.0">
	  <title>MCP Remote Server</title>
	  <style>
		body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; padding: 1rem; background: #f9f9f9; border-radius: 8px; }
		h1 { color: #2d7be5; }
		code { background: #eee; padding: 2px 4px; border-radius: 4px; }
		ul { margin-top: 0.5rem; }
	  </style>
	</head>
	<body>
	  <h1>MCP Remote Server</h1>
	  <p>This is a minimal MCP server that responds to <b>POST</b> requests with a JSON body. It is designed to be used remotely by chatbots or other clients.</p>
			<h2>Supported Methods</h2>
			<ul>
				<li><code>get_time</code>: Returns the current time in UTC or a specified timezone.</li>
				<li><code>lucky_number</code>: Returns a random lucky number between 1 and 100.</li>
				<li><code>taylor_lyric</code>: Returns a random lyric and song title from Taylor Swift's discography.</li>
			</ul>
			<p>All requests must be sent as <b>POST</b> with <code>Content-Type: application/json</code>.</p>
	</body>
	</html>`;
			return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
		}

		if (request.method !== 'POST') {
			return new Response(
				JSON.stringify({
					error: 'Method Not Allowed',
					message: 'Use POST with Content-Type: application/json',
					received: request.method
				}),
				{
					status: 405,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		let req;
		try {
			req = await request.json();
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
		}

		   if ((req.method || '').trim().toLowerCase() === 'tools/list') {
			   // Devuelve la lista de métodos soportados
			   return new Response(JSON.stringify({
				   tools: [
					   { name: 'get_time', description: 'Returns the current time in UTC or a specified timezone.' },
					   { name: 'lucky_number', description: 'Returns a random lucky number between 1 and 100.' },
					   { name: 'fun_fact', description: 'Returns a random fun fact.' },
					   { name: 'taylor_lyric', description: 'Returns a random lyric and song title from Taylor Swift\'s discography.' }
				   ]
			   }), { headers: { 'Content-Type': 'application/json' } });
		   }

		   if (req.method === 'get_time') {
			try {
				const date = new Date();
				const tz = req.params?.tz;
				if (tz) {
					const time = date.toLocaleString("es-ES", { timeZone: tz });
					return new Response(JSON.stringify({ timezone: tz, time }), { headers: { 'Content-Type': 'application/json' } });
				}
				return new Response(JSON.stringify({ timezone: "UTC", time: date.toISOString() }), { headers: { 'Content-Type': 'application/json' } });
			} catch {
				return new Response(JSON.stringify({ error: "Zona horaria no válida. Ejemplo: America/Guatemala" }), { headers: { 'Content-Type': 'application/json' } });
			}
		}

		if (req.method === 'lucky_number') {
			const number = Math.floor(Math.random() * 100) + 1;
			return new Response(JSON.stringify({ lucky_number: number }), { headers: { 'Content-Type': 'application/json' } });
		}

		   if (req.method === 'taylor_lyric') {
			   // Importar el array de canciones ya procesado
			   const { taylorSongs } = await import('./taylor_songs.js');
			   const pickSong = taylorSongs[Math.floor(Math.random() * taylorSongs.length)];
			   // lyrics es un string tipo "['line1', 'line2', ...]"
			   let lyricLines = [];
			   try {
				   lyricLines = JSON.parse(pickSong.lyrics.replace(/''/g, '"').replace(/\"/g, '"').replace(/\n/g, ' '));
			   } catch {
				   // fallback: intentar extraer líneas entre comillas simples
				   lyricLines = pickSong.lyrics.match(/'([^']+)'/g)?.map(s => s.slice(1, -1)) || [pickSong.lyrics];
			   }
			   const lyric = lyricLines[Math.floor(Math.random() * lyricLines.length)];
			   return new Response(JSON.stringify({ title: pickSong.title, lyric }), { headers: { 'Content-Type': 'application/json' } });
		   }

		return new Response(JSON.stringify({ error: 'Unknown method' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
	},
};
