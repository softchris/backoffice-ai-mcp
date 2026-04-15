import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "back-office-product-server",
  version: "1.0.0",
});

const products = [];

server.tool("get_products", {}, async () => {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(products),
      },
    ],
  };
});

server.tool(
  "create_product",
  {
    name: z.string().min(1),
    keywords: z.string().min(1),
  },
  async ({ name, keywords }) => {
    const prompt = [
      `Create a compelling, concise e-commerce product description.`,
      `Product title: ${name}`,
      `Keywords: ${keywords}`,
      "Output only the final description text.",
    ].join("\n");

    const response = await server.server.createMessage({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: prompt,
          },
        },
      ],
      systemPrompt:
        "You are a product copywriter who writes clear, benefit-focused descriptions for e-commerce products.",
      maxTokens: 300,
    });

    const description =
      response?.content?.type === "text"
        ? String(response.content.text || "").trim()
        : "";

    const product = {
      id: products.length + 1,
      title: String(name).trim(),
      keywords: String(keywords).trim(),
      description,
      createdAt: new Date().toISOString(),
    };

    products.push(product);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(product),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Back-office MCP server running on stdio");
}

main().catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
