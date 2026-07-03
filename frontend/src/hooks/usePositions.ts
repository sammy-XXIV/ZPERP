import { useReadContract, useReadContracts } from "wagmi";
import { ENGINE_ABI } from "../abis";
import { ADDRESSES } from "../wagmi";

export type Position = {
  id: bigint;
  leverage: number;
  isLong: boolean;
  isOpen: boolean;
  owner: string;
  marginHandle: `0x${string}`;
  sizeHandle: `0x${string}`;
  entryPriceHandle: `0x${string}`;
};

export function useUserPositions(address?: `0x${string}`) {
  const { data: ids } = useReadContract({
    address: ADDRESSES.engine,
    abi: ENGINE_ABI,
    functionName: "getUserPositions",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const contracts = (ids ?? []).map((id) => ({
    address: ADDRESSES.engine,
    abi: ENGINE_ABI,
    functionName: "getPosition" as const,
    args: [id] as const,
  }));

  const { data: positionData } = useReadContracts({
    contracts,
    query: { enabled: contracts.length > 0, refetchInterval: 15_000 },
  });

  const positions: Position[] = (positionData ?? [])
    .map((result, i) => {
      if (result.status !== "success") return null;
      const [leverage, isLong, isOpen, owner, margin, size, entryPrice] = result.result as [
        number, boolean, boolean, string, `0x${string}`, `0x${string}`, `0x${string}`
      ];
      if (!isOpen) return null;
      return {
        id: ids![i],
        leverage,
        isLong,
        isOpen,
        owner,
        marginHandle:     margin,
        sizeHandle:       size,
        entryPriceHandle: entryPrice,
      };
    })
    .filter(Boolean) as Position[];

  return { positions };
}
