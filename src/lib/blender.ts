import { existsSync, readdirSync } from "fs";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";

/**
 * Runs AI-written Blender scripts in a real Blender (headless) to turn "3D as code" into an
 * actual mesh. Only on a machine with Blender installed: never on Vercel. Locally it finds
 * Blender by itself; in production it must be opted into with BLENDER_PATH.
 */

// Install locations are only known at runtime. They are deliberately built so the bundler can't
// see them as literal paths: Turbopack otherwise tries to trace (and pack) the Blender folder.
const UNIX_CANDIDATES: string[] = JSON.parse(
  '["/Applications/Blender.app/Contents/MacOS/Blender","/usr/bin/blender","/usr/local/bin/blender","/snap/bin/blender"]',
);

export function findBlender(): string | null {
  const fromEnv = process.env.BLENDER_PATH || process.env.BLENDER;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const programFiles = process.platform === "win32" ? process.env.ProgramW6432 || process.env.ProgramFiles : undefined;
  if (programFiles) {
    const root = [programFiles, "Blender Foundation"].join(path.sep);
    if (existsSync(root)) {
      // Newest installed version first ("Blender 5.2" > "Blender 4.4").
      const versions = readdirSync(root)
        .filter((d) => d.startsWith("Blender"))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const v of versions) {
        const exe = [root, v, "blender.exe"].join(path.sep);
        if (existsSync(exe)) return exe;
      }
    }
  }
  for (const p of UNIX_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

export function blenderStatus() {
  if (process.env.VERCEL) return { available: false, reason: "Blender can't run on Vercel. Run Bloxy locally to use it." };
  const exe = findBlender();
  if (!exe) return { available: false, reason: "Blender isn't installed on this machine (or set BLENDER_PATH)." };
  if (process.env.NODE_ENV === "production" && !process.env.BLENDER_PATH) {
    return { available: false, reason: "Set BLENDER_PATH to enable Blender on a production server." };
  }
  return { available: true, exe };
}

/**
 * The script comes from an AI, so it is checked before it runs: modeling only. No files,
 * processes, network or dynamic code. A denylist is not a sandbox, which is why this only
 * runs on the user's own machine (or a server that opted in).
 */
export function checkScript(script: string): string | null {
  const banned: [RegExp, string][] = [
    [/\bimport\s+(subprocess|shutil|socket|ctypes|importlib|requests|urllib|http|pathlib|sys|multiprocessing|threading|pickle|marshal|zipfile|tempfile|glob|signal|webbrowser)\b/, "imports a system module"],
    [/\bfrom\s+(os|subprocess|shutil|socket|ctypes|importlib|urllib|http|pathlib|sys|multiprocessing|threading)\b/, "imports from a system module"],
    [/\b(open|exec|eval|compile|__import__|globals|locals|getattr|setattr|delattr|breakpoint|input)\s*\(/, "uses a blocked builtin"],
    [/__(builtins|class|subclasses|globals|code|loader|spec)__/, "uses Python internals"],
    [/\bbpy\.ops\.(wm|preferences|script|file|image\.save|export_scene|import_scene|render\.render)\b/, "uses a blocked Blender operator"],
    [/\bbpy\.(utils|app\.handlers|app\.timers)\b/, "uses a blocked Blender API"],
    [/\.(filepath|filepath_raw)\s*=/, "writes a file path"],
  ];
  for (const [re, why] of banned) if (re.test(script)) return `The script ${why}, so it wasn't run.`;
  // `import os` is fine only for os.environ.get (the 3DCode scripts read SEED that way).
  for (const m of script.matchAll(/\bos\.(\w+)/g)) if (m[1] !== "environ") return "The script uses os beyond os.environ, so it wasn't run.";
  return null;
}

export type BlenderResult =
  /** sheet: a 2x2 JPEG (front, side, top, three-quarter) when asked for, so an AI can see its model. */
  | { ok: true; glb: Buffer; preview: Buffer | null; sheet: Buffer | null; report: Record<string, unknown> }
  | { ok: false; error: string };

let queue: Promise<unknown> = Promise.resolve(); // one Blender at a time

export function runBlenderScript(
  script: string,
  options: RunOptions = {},
): Promise<BlenderResult> {
  const job = queue.then(() => runNow({ script }, options));
  queue = job.catch(() => undefined);
  return job;
}

/**
 * Cleans up a mesh from an AI 3D model (or a library): weld, cut to the triangle budget, scale
 * to studs, set on the ground, and paint it from `concept` when it came back without colour.
 */
export function runBlenderMesh(glb: Buffer, options: RunOptions & { concept?: Buffer } = {}): Promise<BlenderResult> {
  const job = queue.then(() => runNow({ glb, concept: options.concept }, options));
  queue = job.catch(() => undefined);
  return job;
}

type RunOptions = { maxTris?: number; targetStuds?: number; timeoutMs?: number; signal?: AbortSignal; sheet?: boolean };

/** Blender gets a minimal environment: AI-written scripts may read os.environ, so no secrets. */
function blenderEnv(extra: Record<string, string>) {
  const keep = ["SystemRoot", "SYSTEMROOT", "windir", "PATH", "Path", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "LANG"];
  const env: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  return { ...env, ...extra };
}

async function runNow(
  input: { script: string } | { glb: Buffer; concept?: Buffer },
  { maxTris = 10000, targetStuds = 0, timeoutMs = 120_000, signal, sheet = false }: RunOptions,
): Promise<BlenderResult> {
  const status = blenderStatus();
  if (!status.available || !status.exe) return { ok: false, error: status.reason ?? "Blender is not available." };
  if ("script" in input) {
    const unsafe = checkScript(input.script);
    if (unsafe) return { ok: false, error: unsafe };
  }

  // Loaded at runtime so the bundler doesn't trace these runtime paths (it would otherwise
  // pack the whole project into this server function).
  const { spawn } = await import(/* turbopackIgnore: true */ "child_process");
  const { readFile } = await import(/* turbopackIgnore: true */ "fs/promises");
  const dir = await mkdtemp(path.join(os.tmpdir(), "bloxy-blender-"));
  const files = {
    script: path.join(dir, "model.py"),
    glb: path.join(dir, "model.glb"),
    png: path.join(dir, "preview.png"),
    report: path.join(dir, "report.json"),
    sheet: path.join(dir, "sheet.jpg"),
    input: path.join(dir, "input.glb"),
    concept: path.join(dir, "concept"),
  };
  try {
    if ("script" in input) await writeFile(files.script, input.script, "utf8");
    else {
      await writeFile(files.input, input.glb);
      // Blender picks the image reader from the extension, so name it by its real type.
      if (input.concept) {
        const b = input.concept;
        const ext = b.subarray(8, 12).toString("latin1") === "WEBP" ? ".webp" : b[0] === 0xff && b[1] === 0xd8 ? ".jpg" : ".png";
        files.concept += ext;
        await writeFile(files.concept, b);
      }
    }
    const source = "script" in input ? files.script : files.input;
    const extraEnv: Record<string, string> = { SEED: "0" };
    if (!("script" in input) && input.concept) extraEnv.BLOXY_CONCEPT = files.concept;
    const runner = path.join(process.cwd(), "blender", "bloxy_runner.py");
    const args = ["--background", "--factory-startup", "--python", runner, "--", source, files.glb, files.png, files.report, String(maxTris), String(targetStuds), ...(sheet ? [files.sheet] : [])];
    const log = await new Promise<string>((resolve, reject) => {
      const child = spawn(status.exe!, args, { cwd: dir, windowsHide: true, env: blenderEnv(extraEnv) as NodeJS.ProcessEnv });
      let out = "";
      child.stdout.on("data", (d) => (out = (out + d).slice(-20_000)));
      child.stderr.on("data", (d) => (out = (out + d).slice(-20_000)));
      const kill = (why: string) => {
        child.kill();
        reject(new Error(why));
      };
      const timer = setTimeout(() => kill(`Blender took longer than ${timeoutMs / 1000}s and was stopped.`), timeoutMs);
      signal?.addEventListener("abort", () => kill("Stopped."), { once: true });
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", () => {
        clearTimeout(timer);
        resolve(out);
      });
    });
    const report = JSON.parse(await readFile(files.report, "utf8").catch(() => "null")) as Record<string, unknown> | null;
    if (!report) return { ok: false, error: `Blender didn't finish. ${log.split("\n").slice(-6).join(" ").slice(0, 600)}` };
    if (!report.ok) return { ok: false, error: `The Blender script failed: ${String(report.error).slice(-1500)}` };
    const glb = await readFile(files.glb);
    const preview = await readFile(files.png).catch(() => null);
    const sheetJpg = sheet ? await readFile(files.sheet).catch(() => null) : null;
    return { ok: true, glb, preview, sheet: sheetJpg, report };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
