import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CreateMessageRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Ollama } from "ollama";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const port = Number(process.env.PORT || 3200);
const chatModel = process.env.BACKOFFICE_CHAT_MODEL || "phi3:mini";

const ollama = new Ollama();
const mcpClient = new Client(
	{
		name: "back-office-web-client",
		version: "1.0.0",
	},
	{
		capabilities: {
			sampling: {},
		},
	},
);

let mcpConnected = false;

function getTextFromMessageContent(content) {
	if (!content) {
		return "";
	}

	if (Array.isArray(content)) {
		return content
			.filter((item) => item?.type === "text")
			.map((item) => String(item.text || ""))
			.join("\n")
			.trim();
	}

	if (content.type === "text") {
		return String(content.text || "").trim();
	}

	return "";
}

function extractProductFromToolResult(result) {
	const textEntry = Array.isArray(result?.content)
		? result.content.find((item) => item?.type === "text")
		: null;

	if (!textEntry?.text) {
		return null;
	}

	try {
		return JSON.parse(String(textEntry.text));
	} catch {
		return null;
	}
}

async function callOllama(prompt, systemPrompt) {
	const response = await ollama.chat({
		model: chatModel,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: prompt },
		],
	});

	return String(response?.message?.content || "").trim();
}

mcpClient.setRequestHandler(CreateMessageRequestSchema, async (request) => {
	const prompt = request.params.messages
		.map((message) => getTextFromMessageContent(message.content))
		.filter(Boolean)
		.join("\n\n");

	const systemPrompt =
		String(request.params.systemPrompt || "").trim() ||
		"You are a helpful product assistant.";

	const llmResponse = await callOllama(prompt, systemPrompt);

	return {
		model: chatModel,
		role: "assistant",
		content: {
			type: "text",
			text: llmResponse || "I could not generate a product description.",
		},
	};
});

async function ensureMcpConnection() {
	if (mcpConnected) {
		return;
	}

	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [path.join(__dirname, "mcp-server.js")],
		stderr: "pipe",
	});

	if (transport.stderr) {
		transport.stderr.on("data", (chunk) => {
			const message = String(chunk || "").trim();
			if (message) {
				console.error(`[MCP SERVER]: ${message}`);
			}
		});
	}

	await mcpClient.connect(transport);
	mcpConnected = true;
}

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/products", async (_req, res) => {
	try {
		await ensureMcpConnection();

		const result = await mcpClient.callTool({
			name: "get_products",
			arguments: {},
		});

		const products = extractProductFromToolResult(result);
		return res.json({ products: Array.isArray(products) ? products : [] });
	} catch (error) {
		return res.status(500).json({ error: error?.message || "Could not load products" });
	}
});

app.post("/api/products/generate-description", async (req, res) => {
	try {
		const title = String(req.body?.title || "").trim();
		const keywords = String(req.body?.keywords || "").trim();

		if (!title || !keywords) {
			return res.status(400).json({ error: "'title' and 'keywords' are required" });
		}

		await ensureMcpConnection();

		const result = await mcpClient.callTool({
			name: "create_product",
			arguments: {
				name: title,
				keywords,
			},
		});

		const product = extractProductFromToolResult(result);
		if (!product) {
			return res.status(500).json({ error: "Tool did not return a valid product payload" });
		}

		return res.json({ product });
	} catch (error) {
		return res.status(500).json({ error: error?.message || "Could not create product" });
	}
});

app.get("*", (_req, res) => {
	res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, async () => {
	console.log(`[LOG] Back-office app listening on http://localhost:${port}`);

	try {
		await ensureMcpConnection();
		console.log("[LOG] MCP client connected and ready");
	} catch (error) {
		console.error("[WARN] MCP connection is not ready yet:", error?.message || error);
	}
});
