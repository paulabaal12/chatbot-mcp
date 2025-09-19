# mcp-remote

A simple MCP (Model Context Protocol) server running on Cloudflare Workers.

## 🚀 Deployment

This project is deployed at:  
**https://mcp-remote.paulabarillas.workers.dev**

### How to Deploy

You can deploy this project to Cloudflare Workers using the following commands in your terminal:

```sh
# Initialize the project (if not already initialized)
wrangler init mcp-remote-server

# Deploy to Cloudflare Workers
wrangler deploy
```

Example deployment output:
```
Total Upload: 2.78 KiB / gzip: 0.97 KiB
Uploaded mcp-remote (3.06 sec)
Deployed mcp-remote triggers (0.56 sec)
  https://mcp-remote.paulabarillas.workers.dev
Current Version ID: c65a1eef-c533-4d4f-9011-5cdeb946194f
```

## 📦 Project Overview

This is a minimal MCP server that responds to POST requests with a JSON body. It is designed to be used remotely by chatbots or other clients.


### Supported Methods

- `tools/list`: Returns a list of available tools.
- `get_time`: Returns the current time in UTC or a specified timezone.
- `lucky_number`: Returns a random lucky number between 1 and 100.
- `taylor_lyric`: Returns a random lyric and song title from Taylor Swift's discography.

All requests must be sent as POST with `Content-Type: application/json`.

#### Example: Get a random Taylor Swift lyric

```json
POST / HTTP/1.1
Host: mcp-remote.paulabarillas.workers.dev
Content-Type: application/json

{
  "method": "taylor_lyric"
}
```

Example response:

```json
{
  "title": "Love Story",
  "lyric": "Romeo, take me somewhere we can be alone"
}
```

### Example Request

```json
POST / HTTP/1.1
Host: mcp-remote.paulabarillas.workers.dev
Content-Type: application/json

{
  "method": "get_time",
  "params": { "tz": "America/Guatemala" }
}
```

### Example Response

```json
{
  "timezone": "America/Guatemala",
  "time": "9/8/2025, 10:15:00"
}
```

## 🛠️ Usage Scenario

Suppose you have a chatbot that needs to fetch the current time in a specific timezone, a lucky number, or a random Taylor Swift lyric for the user. The chatbot sends a POST request to this MCP server, specifying the desired method. The server responds with the requested information, which the chatbot can then display to the user.

For example, if the chatbot requests a Taylor Swift lyric:

```json
{
  "title": "My Tears Ricochet",
  "lyric": "Anywhere I want, just not home"
}
```

## 📚 Documentation

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers)

## 🐛 Issues

Report issues at:  
https://github.com/cloudflare/workers-sdk/issues/new/choose
