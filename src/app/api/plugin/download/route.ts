import { readFile } from "fs/promises";
import path from "path";

/** Serves the Studio plugin so users can drop it into their Plugins folder. */
export async function GET() {
  const source = await readFile(path.join(process.cwd(), "plugin", "Bloxy.server.lua"), "utf8");
  return new Response(source, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Bloxy.server.lua"',
    },
  });
}
