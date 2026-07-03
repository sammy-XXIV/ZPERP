import { useReadContract } from "wagmi";
import { CHAINLINK_ABI } from "../abis";
import { ADDRESSES } from "../wagmi";

// Real Chainlink ETH/USD price — same feed the contracts read on-chain.
export function useEthPrice() {
  const { data, isLoading } = useReadContract({
    address: ADDRESSES.oracle,
    abi: CHAINLINK_ABI,
    functionName: "latestRoundData",
    query: { refetchInterval: 30_000 },
  });

  const price = data ? Number(data[1]) / 1e8 : undefined;
  return { price, isLoading };
}
