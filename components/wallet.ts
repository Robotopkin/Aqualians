"use client";

import { createWalletClient, custom, getAddress, type Address } from "viem";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
};

function provider() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EthereumProvider }).ethereum ?? null;
}

function client() {
  const ethereum = provider();
  if (!ethereum) throw new Error("Open this page in a browser with MetaMask or Rabby");
  return createWalletClient({ transport: custom(ethereum) });
}

export function walletProvider() {
  return provider();
}

export async function connectWallet() {
  const [address] = await client().requestAddresses();
  if (!address) throw new Error("The wallet did not return an address");
  const checksummed = getAddress(address);
  localStorage.setItem("aurasea_wallet", checksummed);
  return checksummed;
}

export async function silentWallet() {
  const ethereum = provider();
  if (!ethereum) return null;
  try {
    const accounts = await client().getAddresses();
    const first = accounts[0];
    if (!first) return null;
    const checksummed = getAddress(first);
    localStorage.setItem("aurasea_wallet", checksummed);
    return checksummed;
  } catch {
    return null;
  }
}

export async function signWallet(message: string, address: Address) {
  const signature = await client().signMessage({ account: address, message });
  return signature;
}

export async function disconnectWallet() {
  localStorage.removeItem("aurasea_wallet");
  const ethereum = provider();
  if (!ethereum) return;
  try {
    await ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    /* Some wallets have no revoke method. The site session is still cleared. */
  }
}
