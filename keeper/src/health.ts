// Fixed-point constants matching PositionMath.sol
const PRICE_DECIMALS = 100_000_000n; // 1e8
const MAINTENANCE_MARGIN_BPS = 500n;
const BPS = 10_000n;

export function computeNotional(size: bigint, price: bigint): bigint {
  return (size * price) / PRICE_DECIMALS;
}

export function computeMaintenanceMargin(size: bigint, price: bigint): bigint {
  return (computeNotional(size, price) * MAINTENANCE_MARGIN_BPS) / BPS;
}

export function computePnl(
  size: bigint,
  entryPrice: bigint,
  currentPrice: bigint,
  isLong: boolean
): bigint {
  const notional = (size * entryPrice) / PRICE_DECIMALS;
  const priceDelta = currentPrice - entryPrice;
  const rawPnl = (notional * priceDelta) / entryPrice;
  return isLong ? rawPnl : -rawPnl;
}

export function isUndercollateralized(
  margin: bigint,
  size: bigint,
  entryPrice: bigint,
  currentPrice: bigint,
  isLong: boolean
): boolean {
  const unrealizedPnl = computePnl(size, entryPrice, currentPrice, isLong);
  const effectiveMargin =
    unrealizedPnl >= 0n
      ? margin + unrealizedPnl
      : margin > -unrealizedPnl
      ? margin - (-unrealizedPnl)
      : 0n;

  const required = computeMaintenanceMargin(size, currentPrice);
  return effectiveMargin < required;
}
