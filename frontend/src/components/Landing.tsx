import { useEffect, useRef, useState } from "react";
import { useEthPrice } from "../hooks/useEthPrice";
import { ADDRESSES } from "../wagmi";

const HEX = "0123456789abcdef";

// Scramble-to-reveal: random hex resolves into the value, left to right.
// Respects prefers-reduced-motion (instant reveal).
function useScramble(target: string, active: boolean, durationMs = 900) {
  const [text, setText] = useState("████████");
  const raf = useRef<number>();

  useEffect(() => {
    if (!active) { setText("████████"); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setText(target); return; }

    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / durationMs, 1);
      const settled = Math.floor(p * target.length);
      let out = target.slice(0, settled);
      for (let i = settled; i < target.length; i++) {
        out += target[i] === "." || target[i] === "," || target[i] === "$" || target[i] === " "
          ? target[i]
          : HEX[Math.floor(Math.random() * 16)];
      }
      setText(out);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, active, durationMs]);

  return text;
}

function CardRow({ label, value, revealed, delay }: { label: string; value: string; revealed: boolean; delay: number }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!revealed) { setGo(false); return; }
    const t = setTimeout(() => setGo(true), delay);
    return () => clearTimeout(t);
  }, [revealed, delay]);
  const text = useScramble(value, go);
  return (
    <div className="lp-card-row">
      <span className="lp-card-label">{label}</span>
      <span className={`lp-card-value ${go ? "revealed" : ""}`}>{text}</span>
    </div>
  );
}

export function Landing() {
  const { price } = useEthPrice();
  const [revealed, setRevealed] = useState(false);

  const launch = () => { window.location.hash = "#/trade"; };

  return (
    <div className="lp">
      {/* top bar */}
      <header className="lp-bar">
        <span className="lp-logo">ZPERP</span>
        <span className="lp-bar-price">
          ETH/USD{" "}
          <strong>
            {price ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "——"}
          </strong>{" "}
          <span className="lp-bar-src">CHAINLINK · SEPOLIA</span>
        </span>
        <button className="lp-cta lp-cta-sm" onClick={launch}>Launch terminal</button>
      </header>

      {/* hero */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">CONFIDENTIAL PERPETUALS · ZAMA FHEVM · SEPOLIA TESTNET</p>
          <h1 className="lp-h1">
            Everyone sees the trade.
            <br />
            <span className="lp-h1-acid">No one sees your size.</span>
          </h1>
          <p className="lp-sub">
            ZPERP is an ETH/USD perpetual exchange where margin, size, entry and PnL
            live on-chain as FHE ciphertexts. Decryption needs your signature —
            not the exchange's goodwill.
          </p>
          <div className="lp-cta-row">
            <button className="lp-cta" onClick={launch}>Launch terminal</button>
            <a
              className="lp-cta lp-cta-ghost"
              href="https://github.com/sammy-XXIV/ZPERP"
              target="_blank"
              rel="noreferrer"
            >
              Read the contracts
            </a>
          </div>
        </div>

        {/* signature: the position card that decrypts */}
        <div className="lp-card" aria-label="Example encrypted position">
          <div className="lp-card-head">
            <span>POSITION #0 · ETH/USD</span>
            <span className="lp-card-badge">LONG 10×</span>
          </div>
          <CardRow label="MARGIN"      value="1,000.00 cUSDT" revealed={revealed} delay={0} />
          <CardRow label="SIZE"        value="5.7642 ETH"     revealed={revealed} delay={150} />
          <CardRow label="ENTRY"       value="$1,733.21"      revealed={revealed} delay={300} />
          <CardRow label="UNREAL. PNL" value="+$214.55"       revealed={revealed} delay={450} />
          <button className="lp-card-decrypt" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "re-encrypt" : "decrypt"}
          </button>
          <p className="lp-card-caption">
            {revealed
              ? "Only the owner's signature unlocks this view."
              : "This is what everyone else sees. Forever."}
          </p>
        </div>
      </section>

      {/* mechanics — labels are the real primitives */}
      <section className="lp-mech">
        <div className="lp-mech-item">
          <span className="lp-mech-tag">euint64</span>
          <p>
            Positions are encrypted 64-bit integers. The contract locks margin,
            compares balances and settles PnL homomorphically — it never sees a
            plaintext number.
          </p>
        </div>
        <div className="lp-mech-item">
          <span className="lp-mech-tag">client-side FHE</span>
          <p>
            Amounts are encrypted in your browser under the network's FHE key —
            the plaintext never leaves your machine. An input proof binds each
            ciphertext to you and this contract, so ciphertexts can't be forged
            or replayed.
          </p>
        </div>
        <div className="lp-mech-item">
          <span className="lp-mech-tag">KMS + ACL</span>
          <p>
            Decryption is an access-controlled request to Zama's key network.
            Your positions decrypt for you and no one else.
          </p>
        </div>
      </section>

      {/* liquidation trust model — a real 3-step sequence */}
      <section className="lp-liq">
        <h2 className="lp-h2">Liquidations without trust</h2>
        <div className="lp-liq-flow">
          <div className="lp-liq-step">
            <span className="lp-liq-n">flag</span>
            <p>A keeper pre-checks health privately and flags underwater positions, making their values publicly decryptable.</p>
          </div>
          <div className="lp-liq-step">
            <span className="lp-liq-n">prove</span>
            <p>Anyone fetches the cleartexts with a KMS-signed decryption proof from Zama's key network.</p>
          </div>
          <div className="lp-liq-step">
            <span className="lp-liq-n">execute</span>
            <p>The contract verifies the signatures on-chain. Forged numbers revert. Honest execution earns the fee.</p>
          </div>
        </div>
      </section>

      {/* footer: real addresses */}
      <footer className="lp-foot">
        <div className="lp-foot-contracts">
          <a href={`https://sepolia.etherscan.io/address/${ADDRESSES.engine}`} target="_blank" rel="noreferrer">
            PerpEngine <span>{ADDRESSES.engine}</span>
          </a>
          <a href={`https://sepolia.etherscan.io/address/${ADDRESSES.vault}`} target="_blank" rel="noreferrer">
            PerpVault <span>{ADDRESSES.vault}</span>
          </a>
          <a href={`https://sepolia.etherscan.io/address/${ADDRESSES.liquidationEngine}`} target="_blank" rel="noreferrer">
            LiquidationEngine <span>{ADDRESSES.liquidationEngine}</span>
          </a>
        </div>
        <p className="lp-foot-note">Built for the Zama Developer Program · Season 3 · Sepolia testnet</p>
      </footer>
    </div>
  );
}
