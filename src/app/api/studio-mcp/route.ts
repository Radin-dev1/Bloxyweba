import { mcpStudio, studioMcp } from "@/lib/studioMcp";

/** Can Bloxy reach Roblox Studio without the plugin (Studio's built-in MCP server)? */
export async function GET() {
  if (!studioMcp.available()) return Response.json({ available: false, studio: null });
  const studio = await mcpStudio();
  return Response.json({ available: true, studio }, { headers: { "Cache-Control": "no-store" } });
}
