import "dotenv/config";
import { sdk, PERP_ENGINE_ADDRESS, POLL_INTERVAL_MS } from "./config.js";
import { scanAndLiquidate } from "./scanner.js";

async function bootstrap() {
  console.log("[keeper] starting ZPERP liquidation keeper");
  console.log(`[keeper] engine:        ${PERP_ENGINE_ADDRESS}`);
  console.log(`[keeper] poll interval: ${POLL_INTERVAL_MS}ms`);

  // Grant permit so the KMS will accept decrypt requests from this keeper wallet.
  // sdk.permits is the Permits class instance — replaces sdk.grantPermit().
  console.log("[keeper] granting permit for PerpEngine ACL...");
  await sdk.permits.grantPermit([PERP_ENGINE_ADDRESS]);
  console.log("[keeper] permit granted");

  await runCycle();
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
