/**
 * Reads a model's JSON reply while it is still being written and hands over each complete
 * object in its top-level "parts" array as soon as its closing brace arrives, so the browser
 * can show the build growing part by part. Handles strings (with escapes) so braces inside
 * names never confuse it.
 */
export function createPartScanner(onPart: (raw: unknown) => void, onName?: (name: string) => void) {
  let buf = "";
  let pos = 0; // next character to look at
  let state: "seek" | "parts" | "done" = "seek";
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  let named = false;

  return (chunk: string) => {
    buf += chunk;
    if (state === "done") return;

    if (state === "seek") {
      if (!named && onName) {
        const m = /"name"\s*:\s*"((?:[^"\\]|\\.){1,80})"/.exec(buf);
        if (m) {
          named = true;
          try {
            onName(JSON.parse(`"${m[1]}"`) as string);
          } catch {}
        }
      }
      const m = /"parts"\s*:\s*\[/g;
      m.lastIndex = Math.max(0, pos - 16);
      const hit = m.exec(buf);
      if (!hit) {
        pos = buf.length;
        return;
      }
      state = "parts";
      pos = hit.index + hit[0].length;
    }

    for (; pos < buf.length; pos++) {
      const ch = buf[pos];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{" || ch === "[") {
        if (depth === 0 && ch === "{") objStart = pos;
        depth++;
      } else if (ch === "}" || ch === "]") {
        if (depth === 0 && ch === "]") {
          state = "done"; // end of the parts array
          return;
        }
        depth--;
        if (depth === 0 && ch === "}" && objStart !== -1) {
          try {
            onPart(JSON.parse(buf.slice(objStart, pos + 1)));
          } catch {}
          objStart = -1;
        }
      }
    }
  };
}
