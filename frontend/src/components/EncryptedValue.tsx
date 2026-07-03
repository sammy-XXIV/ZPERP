import { useState } from "react";
import { useDecryptValues, useGrantPermit, useHasPermit } from "@zama-fhe/react-sdk";
import { useAccount } from "wagmi";
import { ADDRESSES } from "../wagmi";
import { useElapsed } from "../hooks/useElapsed";

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
      <span className="enc-revealed">{formatted ?? "—"}</span>
    </span>
  );
}
