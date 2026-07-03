import { useEffect, useState } from "react";

// Seconds elapsed since `active` became true; resets to 0 when inactive.
// Used to show progress on slow FHE operations (proof generation, KMS decryption).
export function useElapsed(active: boolean) {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (!active) { setSec(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);

  return sec;
}
