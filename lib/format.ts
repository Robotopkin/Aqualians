export function formatAura(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(value)).replace(/,/g, " ");
}

export function compactAura(value: number) {
  const amount = Math.floor(value);
  const abs = Math.abs(amount);
  if (abs < 1_000) return formatAura(amount);
  const units = abs >= 1_000_000_000 ? ["b", 1_000_000_000, 2] : abs >= 1_000_000 ? ["m", 1_000_000, 2] : ["k", 1_000, 1];
  const [suffix, divisor, digits] = units as [string, number, number];
  return `${(amount / divisor).toFixed(digits).replace(/\.?0+$/, "")}${suffix}`;
}
