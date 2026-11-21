---
name: mcp-builder
description: Build an MCP server (tools an AI can call) in Node or Python for a given API or service.
---

# Building an MCP server
1. List the 3 to 8 actions people really need; one tool per action with a clear name, description and typed inputs.
2. Use the official SDK (`@modelcontextprotocol/sdk` for Node, `mcp` for Python). Return short, useful text or JSON; errors as readable messages, never stack traces.
3. Keep secrets in environment variables. Never log them.
4. Test every tool by calling it with real input and with bad input. Document install and the one-line config in a README.
