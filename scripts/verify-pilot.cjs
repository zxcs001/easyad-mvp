const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { createWriteStream } = require("node:fs");
const { preparePilotEnvironment } = require("./pilot-environment.cjs");

(async () => {
  const env = await preparePilotEnvironment();
  const mode = process.argv[2] || "test";
  const commands = {
    test: ["node_modules/vitest/vitest.mjs", "run"],
    browser: ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.player.config.ts"],
  };
  if (!commands[mode]) throw new Error("Use test or browser mode.");
  console.log(`Pilot ${mode}: local test database, isolated easyad_player_pilot schema, payments disabled.`);
  let server;
  let log;
  try {
    if (mode === "browser") {
      // Own the single production-server process so cleanup works on Windows without taskkill.
      // A production build also prevents development HMR from interrupting pairing requests.
      try {
        await fetch("http://localhost:3100", { signal: AbortSignal.timeout(1000) });
        throw new Error("Port 3100 is already serving an app. Stop that server before pilot checks.");
      } catch (error) { if (error.message.startsWith("Port 3100")) throw error; }
      const flags = env.PILOT_CAMPAIGN_FLAGS === "false" ? "false" : "true";
      log = createWriteStream(".pilot-server.log");
      server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3100"], {
        env: { ...env, NODE_ENV: "production", APP_ORIGIN: "http://localhost:3100", FEATURE_PLAYER_CONTROL: "true",
          FEATURE_CAMPAIGN_MODEL_V2: flags, FEATURE_AGENCY_WORKSPACE: flags, FEATURE_STATIC_FULFILLMENT: flags, FEATURE_FLEET_OPERATIONS: flags,
          PLAYER_POLL_MS: "10000", PLAYER_HEARTBEAT_MS: "5000", PLAYER_STALE_MS: "15000" },
        stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
      });
      server.stdout.pipe(log); server.stderr.pipe(log);
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (server.exitCode !== null) throw new Error("Pilot server exited. See .pilot-server.log.");
        try { const response = await fetch("http://localhost:3100/api/health", { signal: AbortSignal.timeout(2000) }); if (response.ok) { ready = true; break; } } catch {}
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!ready) throw new Error("Pilot server did not become healthy. See .pilot-server.log.");
      env.PILOT_MANAGED_SERVER = "true";
    }
    const result = spawnSync(process.execPath, [...commands[mode], ...process.argv.slice(3)], { env, stdio: "inherit", windowsHide: true });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    if (server && server.exitCode === null) { server.kill(); await once(server, "exit"); }
    log?.end();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
