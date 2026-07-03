import "dotenv/config";
import { sdk, PERP_ENGINE_ADDRESS, POLL_INTERVAL_MS } from "./config.js";
import { scanAndLiquidate } from "./scanner.js";

// RUN_ONCE=1 runs a single scan cycle and exits — used by the GitHub Actions
// cron so the workflow terminates instead of polling forever.
const RUN_ONCE = process.env.RUN_ONCE === "1";

async function bootstrap() {
  console.log("[keeper] starting ZPERP liquidation keeper");
  console.log(`[keeper] engine:        ${PERP_ENGINE_ADDRESS}`);
  console.log(`[keeper] mode:          ${RUN_ONCE ? "single cycle" : `poll every ${POLL_INTERVAL_MS}ms`}`);

  // Grant permit so the KMS will accept decrypt requests from this keeper wallet.
  console.log("[keeper] granting permit for PerpEngine ACL...");
  await sdk.permits.grantPermit([PERP_ENGINE_ADDRESS]);
  console.log("[keeper] permit granted");

  await runCycle();

  if (RUN_ONCE) {
    console.log("[keeper] single cycle complete, exiting");
    process.exit(0);
  }

  setInterval(runCycle, POLL_INTERVAL_MS);
}

async function runCycle() {
  const start = Date.now();
  try {
    await scanAndLiquidate();
  } catch (err) {
    console.error("[keeper] cycle error:", err);
  }
  console.log(`[keeper] cycle done in ${Date.now() - start}ms`);
}

bootstrap().catch((err) => {
  console.error("[keeper] fatal:", err);
  process.exit(1);
});
