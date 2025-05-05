import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from 'cloudflare:workers'
function getEnv<Env>() {
	return env as Env
}

const env2 = getEnv<Env>()
console.log(`env2: ${JSON.stringify(env2)}`)

interface GiphyResponse {
	data: Array<{
		images: {
			fixed_height: {
				url: string;
			};
		};
	}>;
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);

		// Giphy search tool
		this.server.tool(
			"searchGif",
			{ query: z.string() },
			async ({ query }) => {
				console.log(`query ${query}`);
				const APIkey = await (env as any).GIPHY_API_KEY.get();
				console.log(`APIkey: ${APIkey}`)
				if (!APIkey) {
					return {
						content: [{
							type: "text",
							text: "Error: GIPHY_API_KEY environment variable is not set"
						}]
					};
				}

				try {
					const response = await fetch(
						`https://api.giphy.com/v1/gifs/search?api_key=${APIkey}&q=${encodeURIComponent(query)}&limit=1&offset=0&rating=g&lang=en`
					);
					const data = await response.json() as GiphyResponse;

					if (data.data && data.data.length > 0) {
						const gifUrl = data.data[0].images.fixed_height.url;
						// Fetch the actual GIF data
						const gifResponse = await fetch(gifUrl);
						const gifData = await gifResponse.arrayBuffer();
						const base64Data = Buffer.from(gifData).toString('base64');

						return {
							content: [
								{ type: "text", text: "Here's a GIF for you:" },
								{ 
									type: "image", 
									data: base64Data,
									mimeType: "image/gif"
								}
							]
						};
					} else {
						return {
							content: [{
								type: "text",
								text: "No GIFs found for your search query"
							}]
						};
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
					return {
						content: [{
							type: "text",
							text: `Error searching for GIF: ${errorMessage}`
						}]
					};
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			// @ts-ignore
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			// @ts-ignore
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
