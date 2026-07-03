import { useState } from "react";
import { useAccount, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useEncrypt } from "@zama-fhe/react-sdk";
import { ENGINE_ABI, VAULT_ABI, CUSDT_ABI, USDT_ABI } from "../abis";
import { ADDRESSES } from "../wagmi";
import { useEthPrice } from "../hooks/useEthPrice";
import { useElapsed } from "../hooks/useElapsed";
import { EncryptedValue } from "./EncryptedValue";

const ZERO_HANDLE = ("0x" + "0".repeat(64)) as `0x${string}`;

const FAUCET_AMOUNT = 10_000n * 10n ** 6n; // 10,000 USDT (6 decimals)

const LEVERAGES = [2, 5, 10, 25, 50];
type Mode = "long" | "short" | "deposit" | "withdraw";

export function TradePanel() {
  const { address, isConnected } = useAccount();
  const encrypt = useEncrypt();
  const { price } = useEthPrice();

  const [mode, setMode] = useState<Mode>("long");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [size, setSize] = useState("");
  const [margin, setMargin] = useState("");
  const [leverage, setLeverage] = useState(10);
  const [amount, setAmount] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const engineReady = !!ADDRESSES.engine;
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  // ERC-7984 has no allowance — the vault must be an approved operator to pull deposits.
  // Polled so the button flips as soon as the approval tx mines.
  const { data: isOperator, refetch: refetchOperator } = useReadContract({
    address: ADDRESSES.cUSDT,
    abi: CUSDT_ABI,
    functionName: "isOperator",
    args: address ? [address, ADDRESSES.vault] : undefined,
    query: { enabled: !!address && !!ADDRESSES.vault, refetchInterval: 5_000 },
  });

  // deposited margin available for opening positions (encrypted)
  const { data: vaultMarginHandle } = useReadContract({
    address: ADDRESSES.vault,
    abi: VAULT_ABI,
    functionName: "marginOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const hasVaultMargin = vaultMarginHandle && vaultMarginHandle !== ZERO_HANDLE;

  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [fauceting, setFauceting] = useState(false);

  // Faucet: mock USDT has an open public mint, so mint + wrap straight
  // from the user's own wallet — no backend needed.
  async function handleFaucet() {
    if (!address || !publicClient) return;
    setFauceting(true);
    try {
      showToast("1/2 Minting mock USDT...");
      const mintTx = await writeContractAsync({
        address: ADDRESSES.usdt, abi: USDT_ABI, functionName: "mint",
        args: [address, FAUCET_AMOUNT],
      });
      await publicClient.waitForTransactionReceipt({ hash: mintTx });

      // mock grants infinite allowance by default; approve only if a wallet somehow lacks it
      const allowance = await publicClient.readContract({
        address: ADDRESSES.usdt, abi: USDT_ABI, functionName: "allowance",
        args: [address, ADDRESSES.cUSDT],
      });
      if (allowance < FAUCET_AMOUNT) {
        const approveTx = await writeContractAsync({
          address: ADDRESSES.usdt, abi: USDT_ABI, functionName: "approve",
          args: [ADDRESSES.cUSDT, FAUCET_AMOUNT],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
      }

      showToast("2/2 Wrapping into cUSDT...");
      const wrapTx = await writeContractAsync({
        address: ADDRESSES.cUSDT, abi: CUSDT_ABI, functionName: "wrap",
        args: [address, FAUCET_AMOUNT],
      });
      await publicClient.waitForTransactionReceipt({ hash: wrapTx });
      showToast("10,000 cUSDT received");
    } catch (e) {
      showToast(e instanceof Error ? e.message.slice(0, 60) : "Faucet failed");
    } finally {
      setFauceting(false);
    }
  }

  function approveVaultOperator() {
    const until = Math.floor(Date.now() / 1000) + 365 * 24 * 3600; // 1 year
    writeContract({
      address: ADDRESSES.cUSDT, abi: CUSDT_ABI, functionName: "setOperator",
      args: [ADDRESSES.vault, until],
    }, {
      onSuccess: () => { showToast("Vault approved as operator"); setTimeout(() => refetchOperator(), 4000); },
      onError:   (e) => showToast(e.message.slice(0, 60)),
    });
  }

  const busy = isPending || isConfirming || encrypt.isPending;

  // staged progress for slow FHE flows: proof generation (client CPU, slow) →
  // wallet confirmation → transaction mining
  const encryptSec = useElapsed(encrypt.isPending);
  const stage = encrypt.isPending
    ? `Encrypting proof ${encryptSec}s`
    : isPending ? "Confirm in wallet..."
    : isConfirming ? "Confirming tx..."
    : null;
  const stageLabel = (idle: string) =>
    stage ? <><span className="spinner" />{stage}</> : idle;
  const isTradeMode = mode === "long" || mode === "short";

  // size IS the notional in cUSDT (matches PerpEngine semantics)
  const notional = size ? parseFloat(size).toFixed(2) : "—";

  // Liquidation when margin + pnl < 5% of notional (PositionMath.maintenanceMargin).
  // Long:  P = E * (1 - margin/size) / 0.95
  // Short: P = E * (1 + margin/size) / 1.05
  const liqPrice = (() => {
    const m = parseFloat(margin), s = parseFloat(size);
    if (!price || isNaN(m) || isNaN(s) || s <= 0) return "—";
    const ratio = m / s;
    const p = mode === "long"
      ? (price * (1 - ratio)) / 0.95
      : (price * (1 + ratio)) / 1.05;
    return p > 0 ? p.toFixed(2) : "—";
  })();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // margin and size are linked through leverage: size = margin × leverage
  const fmt = (n: number) => (Number.isFinite(n) && n > 0 ? String(Number(n.toFixed(2))) : "");

  function onMarginChange(v: string) {
    setMargin(v);
    const m = parseFloat(v);
    setSize(fmt(m * leverage));
  }

  function onSizeChange(v: string) {
    setSize(v);
    const s = parseFloat(v);
    setMargin(fmt(s / leverage));
  }

  function onLeverageChange(l: number) {
    setLeverage(l);
    const m = parseFloat(margin);
    if (!isNaN(m) && m > 0) setSize(fmt(m * l));
  }

  async function handleOpen() {
    if (!address || !engineReady || !price) return;
    const marginVal = parseFloat(margin) * 1e6;
    const sizeUsd   = parseFloat(size);
    if (isNaN(marginVal) || isNaN(sizeUsd) || marginVal <= 0 || sizeUsd <= 0) return;

    // contract stores size as ETH quantity (6 decimals) so PnL settles
    // homomorphically: pnl = size * (mark - entry)
    const sizeEthVal = (sizeUsd / price) * 1e6;

    try {
      // one encrypt call carries both values and yields a single shared proof
      const { encryptedValues, inputProof } = await encrypt.mutateAsync({
        values: [
          { value: BigInt(Math.floor(marginVal)),  type: "euint64" },
          { value: BigInt(Math.floor(sizeEthVal)), type: "euint64" },
        ],
        contractAddress: ADDRESSES.engine,
        userAddress: address,
      });

      writeContract({
        address: ADDRESSES.engine, abi: ENGINE_ABI, functionName: "openPosition",
        args: [encryptedValues[0], inputProof, encryptedValues[1], inputProof, mode === "long", leverage],
        gas: 5_000_000n, // explicit — MetaMask over-estimates FHE ops and the RPC rejects the tx
      }, {
        onSuccess: () => { showToast("Position opened"); setSize(""); setMargin(""); },
        onError:   (e) => showToast(e.message.slice(0, 60)),
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message.slice(0, 60) : "Encryption failed");
    }
  }

  async function handleVault(fn: "deposit" | "withdraw") {
    if (!address || !ADDRESSES.vault) return;
    const val = parseFloat(amount) * 1e6;
    if (isNaN(val) || val <= 0) return;

    try {
      const { encryptedValues, inputProof } = await encrypt.mutateAsync({
        values: [{ value: BigInt(Math.floor(val)), type: "euint64" }],
        contractAddress: ADDRESSES.vault,
        userAddress: address,
      });

      writeContract({
        address: ADDRESSES.vault, abi: VAULT_ABI, functionName: fn,
        args: [encryptedValues[0], inputProof],
        gas: 3_000_000n, // explicit — MetaMask over-estimates FHE ops and the RPC rejects the tx
      }, {
        onSuccess: () => { showToast(fn === "deposit" ? "Deposited" : "Withdrawn"); setAmount(""); },
        onError:   (e) => showToast(e.message.slice(0, 60)),
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message.slice(0, 60) : "Encryption failed");
    }
  }

  return (
    <>
      <div className="t-trade">
        {/* mode selector */}
        <div className="panel-section" style={{ paddingBottom: 10 }}>
          <div className="dir-tabs" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            {(["long","short","deposit","withdraw"] as Mode[]).map((m) => (
              <button
                key={m}
                className={`dir-tab ${mode === m ? (m === "long" ? "long" : m === "short" ? "short" : "") : ""}`}
                style={mode === m && (m === "deposit" || m === "withdraw") ? { background: "rgba(200,255,0,0.08)", color: "var(--acid)", border: "1px solid rgba(200,255,0,0.2)" } : {}}
                onClick={() => setMode(m)}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {isTradeMode && (
          <>
            <div className="panel-section">
              <div className="panel-label">Order Type</div>
              <div className="type-tabs">
                {(["market","limit"] as const).map((t) => (
                  <button key={t} className={`type-tab ${orderType === t ? "active" : ""}`} onClick={() => setOrderType(t)}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="panel-label">Leverage</div>
              <div className="lev-strip">
                {LEVERAGES.map((l) => (
                  <button key={l} className={`lev-btn ${leverage === l ? "active" : ""}`} onClick={() => onLeverageChange(l)}>
                    {l}×
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-section">
              <div className="f-wrap">
                <label className="f-label">Margin</label>
                <input className="f-input" type="number" placeholder="0.00" value={margin} onChange={(e) => onMarginChange(e.target.value)} />
                <span className="f-suffix">cUSDT</span>
              </div>
              <div className="f-wrap">
                <label className="f-label">Size ({leverage}× margin)</label>
                <input className="f-input" type="number" placeholder="0.00" value={size} onChange={(e) => onSizeChange(e.target.value)} />
                <span className="f-suffix">cUSDT</span>
              </div>
            </div>

            <div className="panel-section">
              <div className="stat-row">
                <span>Vault Margin</span>
                {hasVaultMargin ? (
                  <EncryptedValue handle={vaultMarginHandle as `0x${string}`} decimals={6} contract={ADDRESSES.vault} />
                ) : (
                  <span style={{ fontSize: "0.52rem" }}>0.00 · margin pulls from wallet</span>
                )}
              </div>
              <div className="stat-row"><span>Notional</span><span>${notional}</span></div>
              <div className="stat-row"><span>Est. Liq. Price</span><span style={{ color: mode === "long" ? "var(--red)" : "var(--mint)" }}>${liqPrice}</span></div>
              <div className="stat-row"><span>Maint. Margin</span><span>5%</span></div>
              <div className="stat-row"><span>Liq. Fee</span><span>1% + 0.5% ins.</span></div>
            </div>

            <div className="panel-section">
              {!isConnected ? (
                <button className="btn-ghost">Connect Wallet</button>
              ) : !isOperator ? (
                // one-time cUSDT approval — lets the vault pull margin straight
                // from the wallet when opening positions (and on deposits)
                <button className="btn-acid" onClick={approveVaultOperator} disabled={busy}>
                  {stageLabel("Approve cUSDT (one-time)")}
                </button>
              ) : mode === "long" ? (
                <button className="btn-long" onClick={handleOpen} disabled={busy || !margin || !size}>
                  {stageLabel(`Open Long ${leverage}×`)}
                </button>
              ) : (
                <button className="btn-short" onClick={handleOpen} disabled={busy || !margin || !size}>
                  {stageLabel(`Open Short ${leverage}×`)}
                </button>
              )}
            </div>

            <div className="panel-section" style={{ marginTop: "auto" }}>
              <div className="stat-row">
                <span>Privacy</span>
                <span style={{ color: "var(--acid)", fontSize: "0.52rem" }}>FHE · Encrypted</span>
              </div>
              <div className="stat-row">
                <span>Oracle</span>
                <span style={{ fontSize: "0.52rem" }}>Chainlink</span>
              </div>
            </div>
          </>
        )}

        {(mode === "deposit" || mode === "withdraw") && (
          <>
            <div className="panel-section">
              <div className="stat-row" style={{ marginBottom: 8 }}>
                <span>Vault Margin</span>
                {hasVaultMargin ? (
                  <EncryptedValue handle={vaultMarginHandle as `0x${string}`} decimals={6} contract={ADDRESSES.vault} />
                ) : (
                  <span>0.00</span>
                )}
              </div>
              <div className="f-wrap" style={{ marginTop: 4 }}>
                <label className="f-label">Amount</label>
                <input className="f-input" type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span className="f-suffix">cUSDT</span>
              </div>
            </div>
            <div className="panel-section">
              {!isConnected ? (
                <button className="btn-ghost">Connect Wallet</button>
              ) : mode === "deposit" && !isOperator ? (
                <button className="btn-acid" onClick={approveVaultOperator} disabled={busy}>
                  {stageLabel("Approve Vault (cUSDT Operator)")}
                </button>
              ) : (
                <button className="btn-acid" onClick={() => handleVault(mode as "deposit" | "withdraw")} disabled={busy || !amount}>
                  {stageLabel(mode === "deposit" ? "Deposit Margin" : "Withdraw Margin")}
                </button>
              )}
            </div>

            {mode === "deposit" && isConnected && (
              <div className="panel-section">
                <button className="btn-ghost" onClick={handleFaucet} disabled={fauceting || busy} style={{ width: "100%" }}>
                  {fauceting ? "Minting + Wrapping..." : "FAUCET · Get 10,000 cUSDT"}
                </button>
                <div className="stat-row" style={{ marginTop: 6 }}>
                  <span>Faucet</span>
                  <span style={{ fontSize: "0.52rem" }}>mints mock USDT, wraps to cUSDT</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
