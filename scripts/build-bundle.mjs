import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = join(root, "bundle");
const frontendDir = join(root, "frontend");
const frontendBuildDir = join(frontendDir, "dist", "snip-frontend", "browser");
const push = process.argv.includes("--push");

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function output(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function hasStagedChanges(cwd) {
  const result = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd });
  if (result.error) throw result.error;
  if (result.status === 0) return false;
  if (result.status === 1) return true;
  throw new Error(`git diff --cached failed with exit code ${result.status}`);
}

async function ensureFrontendIsClean() {
  const status = output("git", ["status", "--porcelain"], frontendDir);
  if (status) {
    throw new Error(
      `Frontend submodule has local changes; commit or discard them before building:\n${status}`,
    );
  }
}

async function assembleBundle() {
  const indexPath = join(frontendBuildDir, "index.html");
  try {
    await readFile(indexPath);
  } catch {
    throw new Error(`Frontend build output is missing: ${indexPath}`);
  }

  await cp(join(root, "backend", "server.js"), join(bundleDir, "server.js"));
  await cp(join(root, "cli", "cli.js"), join(bundleDir, "cli.js"));

  const publicDir = join(bundleDir, "public");
  await rm(publicDir, { recursive: true, force: true });
  await cp(frontendBuildDir, publicDir, { recursive: true });

  await writeFile(join(bundleDir, ".env"), "PUBLIC_DIR=./public\n");
  await writeFile(
    join(bundleDir, "package.json"),
    `${JSON.stringify(
      {
        name: "snip-bundle",
        private: true,
        scripts: { start: "bun server.js" },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(bundleDir, "Dockerfile"),
    [
      "FROM oven/bun:1-alpine",
      "COPY . .",
      "ENV PORT=3000",
      "EXPOSE 3000",
      'CMD ["bun", "server.js"]',
      "",
    ].join("\n"),
  );
  await writeFile(
    join(bundleDir, ".dockerignore"),
    [".git", "node_modules", "npm-debug.log", ""].join("\n"),
  );
  await writeFile(
    join(bundleDir, "railway.json"),
    `${JSON.stringify(
      {
        "$schema": "https://railway.app/railway.schema.json",
        build: { builder: "DOCKERFILE" },
      },
      null,
      2,
    )}\n`,
  );
}

async function main() {
  if (output("git", ["branch", "--show-current"]) !== "main") {
    throw new Error("Run this script from the main branch.");
  }

  run("git", ["submodule", "update", "--init", "--remote", "backend", "frontend", "cli"]);
  await ensureFrontendIsClean();

  run("npm", ["install"], frontendDir);
  run("npm", ["audit", "--audit-level=high"], frontendDir);
  await ensureFrontendIsClean();
  run("npx", ["ng", "build"], frontendDir);
  await assembleBundle();

  run("git", ["add", "-A"], bundleDir);
  const bundleChanged = hasStagedChanges(bundleDir);
  if (bundleChanged) {
    run(
      "git",
      [
        "commit",
        "-m",
        "Regenerate bundle",
        "-m",
        "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
        "-m",
        "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
      ],
      bundleDir,
    );
  }

  run("git", ["add", "backend", "frontend", "cli", "bundle"]);
  const mainChanged = hasStagedChanges(root);
  if (mainChanged) {
    run(
      "git",
      [
        "commit",
        "-m",
        "Update source and bundle submodule pointers",
        "-m",
        "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
        "-m",
        "Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>",
      ],
    );
  }

  if (push) {
    run("git", ["push", "origin", "HEAD:bundle"], bundleDir);
    run("git", ["push", "origin", "HEAD:main"]);
  }

  if (!bundleChanged && !mainChanged) {
    console.log("unchanged");
  } else {
    console.log(`Bundle ${bundleChanged ? "regenerated" : "unchanged"}; superproject pointers ${mainChanged ? "updated" : "unchanged"}.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
