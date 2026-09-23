import { getAddress, isAddress } from "viem";
import type { BetLine } from "./types";

export function normalizeHandle(input: string) {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export function validHandle(handle: string) {
  return /^[a-z0-9_]{1,15}$/.test(handle);
}

export function checksum(address: string) {
  if (!isAddress(address)) return null;
  return getAddress(address);
}

export function registerMessage(input: {
  address: string;
  xHandle: string;
  referral: string;
  nonce: string;
}) {
  return [
    "AuraSea",
    "Action: Register",
    `Wallet: ${input.address}`,
    `X: ${input.xHandle}`,
    `Referral: ${input.referral || "-"}`,
    `Nonce: ${input.nonce}`,
  ].join("\n");
}

export function loginMessage(input: { address: string; nonce: string }) {
  return ["AuraSea", "Action: Login", `Wallet: ${input.address}`, `Nonce: ${input.nonce}`].join("\n");
}

export function betMessage(input: { address: string; roundId: string; lines: BetLine[]; nonce: string }) {
  const body =
    input.lines
      .slice()
      .sort((a, b) => a.category.localeCompare(b.category) || a.rank - b.rank)
      .map((line) => `${line.category}:${line.rank}:${line.amount}`)
      .join(",") || "-";
  return [
    "AuraSea",
    "Action: Place bets",
    `Round: ${input.roundId}`,
    `Wallet: ${input.address}`,
    `Bets: ${body}`,
    `Nonce: ${input.nonce}`,
  ].join("\n");
}

export function receiptMessage(input: {
  action: string;
  address: string;
  amount: number;
  ref: string;
  nonce: string;
}) {
  return [
    "AuraSea receipt",
    `Action: ${input.action}`,
    `Wallet: ${input.address}`,
    `Amount: ${input.amount}`,
    `Ref: ${input.ref}`,
    `Nonce: ${input.nonce}`,
  ].join("\n");
}
