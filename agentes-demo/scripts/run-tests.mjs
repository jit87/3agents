import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = await mkdtemp(join(tmpdir(), "agentes-demo-tests-"));
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const tests = (await readdir(join(root, "tests"))).filter((name) => name.endsWith(".test.mjs")).map((name) => join(root, "tests", name));

function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  return result.status === 0;
}

try {
  const compiled = run([tsc, "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node", "--rootDir", ".", "--strict", "--skipLibCheck", "--outDir", output, "lib/workflow-core.ts", "lib/llm.ts", "lib/workflow-response.ts"]);
  if (compiled) run(["--test", ...tests], { ...process.env, WORKFLOW_TEST_BUILD_DIR: output });
} finally {
  await rm(output, { recursive: true, force: true });
}
