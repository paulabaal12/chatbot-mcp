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
		<li><code>fun_fact</code>: Returns a random fun fact.</li>
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

		if (req.method === 'fun_fact') {
			const facts = [
				"Los flamencos nacen grises, no rosados 🦩",
				"El corazón de un camarón está en su cabeza 🦐",
				"Las abejas pueden reconocer rostros humanos 🐝",
				"Los tiburones existen desde antes que los árboles 🦈🌳",
				"Un pulpo tiene tres corazones y sangre azul 🐙",
			];
			const fact = facts[Math.floor(Math.random() * facts.length)];
			return new Response(JSON.stringify({ fact }), { headers: { 'Content-Type': 'application/json' } });
		}

		return new Response(JSON.stringify({ error: 'Unknown method' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
	},
};
