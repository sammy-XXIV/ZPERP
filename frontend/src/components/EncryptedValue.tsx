import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDecryptValues, useGrantPermit, useHasPermit } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";
import { ADDRESSES } from "../wagmi";
import { useElapsed } from "../hooks/useElapsed";

// revealed values re-hide after this long; hiding also drops the cached
// plaintext so the next reveal is a fresh KMS decryption
export const REVEAL_MS = 30_000;

type Props = {
  handle: `0x${string}`;
  format?: (raw: bigint) => string;
  decimals?: number;
  /** contract the handle's ACL belongs to — defaults to the engine */
  contract?: `0x${string}`;
};

const defaultFormat = (raw: bigint, decimals = 6) =>
  (Number(raw) / 10 ** decimals).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

export function EncryptedValue({ handle, format, decimals = 6, contract = ADDRESSES.engine }: Props) {
  const { isConnected } = useAccount();
  const [shouldDecrypt, setShouldDecrypt] = useState(false);

  // Decryption requires a permit for the owning contract; the hook does not
  // gate on permits itself (per Zama SDK docs), so we check and grant manually.
  const { data: hasPermit } = useHasPermit(
    { contractAddresses: [contract] },
    { enabled: isConnected }
  );
  const { mutate: grantPermit, isPending: isGranting } = useGrantPermit({
    onError: (e) => console.error("[grantPermit] failed:", e),
  });

  const { data, isLoading, isError } = useDecryptValues(
    [{ encryptedValue: handle, contractAddress: contract }],
    { enabled: shouldDecrypt && isConnected && !!hasPermit }
  );
  const decryptSec = useElapsed(isLoading);

  const raw = data?.[handle] !== undefined ? BigInt(data[handle] as string | number | bigint) : null;
  const formatted = raw !== null ? (format ? format(raw) : defaultFormat(raw, decimals)) : null;

  const queryClient = useQueryClient();
  function hide() {
    setShouldDecrypt(false);
    // forget the plaintext — next reveal must round-trip the KMS again
    queryClient.removeQueries({
      predicate: (q) => JSON.stringify(q.queryKey).includes(handle.toLowerCase()) || JSON.stringify(q.queryKey).includes(handle),
    });
  }

  // auto re-hide after REVEAL_MS
  useEffect(() => {
    if (!shouldDecrypt || raw === null) return;
    const t = setTimeout(hide, REVEAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldDecrypt, raw]);

  function handleDecryptClick() {
    if (!hasPermit) grantPermit([contract]);
    setShouldDecrypt(true);
  }

  if (!shouldDecrypt) {
    return (
      <span className="enc-val">
        <span className="enc-redacted">████████</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleDecryptClick}
          title={isConnected ? "Decrypt via KMS" : "Connect wallet to decrypt"}
        >
          decrypt
        </button>
      </span>
    );
  }

  if (isGranting) {
    return (
      <span className="enc-val">
        <span className="spinner" />
        <span className="enc-loading">SIGN IN WALLET...</span>
      </span>
    );
  }

  if (shouldDecrypt && !hasPermit) {
    // permit signature rejected or not yet granted
    return (
      <span className="enc-val">
        <span className="enc-redacted">████████</span>
        <button className="btn btn-ghost btn-sm" onClick={() => grantPermit([contract])}>
          authorize
        </button>
      </span>
    );
  }

  if (isLoading) {
    return (
      <span className="enc-val">
        <span className="spinner" />
        <span className="enc-loading">DECRYPTING {decryptSec}s</span>
      </span>
    );
  }

  if (isError) {
    return (
      <span className="enc-val">
        <span className="enc-redacted" title="Decryption failed">ERR</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setShouldDecrypt(false)}>retry</button>
      </span>
    );
  }

  return (
    <span className="enc-val">
      <span
        className="enc-revealed"
        onClick={hide}
        title="Click to re-encrypt (auto-hides after 30s)"
        style={{ cursor: "pointer" }}
      >
        {formatted ?? "—"}
      </span>
    </span>
  );
}
