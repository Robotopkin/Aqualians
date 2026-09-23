import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { serverPrivateKey } from "./config";
import { metaGet, metaSetIfAbsent } from "./db";
import { receiptMessage } from "./messages";

type Account = ReturnType<typeof privateKeyToAccount>;

const globalForKey = globalThis as unknown as { auraseaAccount?: Account };

function accountFromKey(raw: string): Account {
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  return privateKeyToAccount(key);
}

async function loadAccount(): Promise<Account> {
  const fromEnv = serverPrivateKey();
  if (fromEnv) return accountFromKey(fromEnv);
  const existing = await metaGet("attestation_key");
  if (existing) return accountFromKey(existing);
  const privateKey = generatePrivateKey();
  await metaSetIfAbsent("attestation_key", privateKey);
  const stored = (await metaGet("attestation_key")) || privateKey;
  const account = accountFromKey(stored);
  console.log(`AuraSea attestation wallet created: ${account.address}`);
  return account;
}

export async function ensureServerAccount() {
  if (!globalForKey.auraseaAccount) globalForKey.auraseaAccount = await loadAccount();
  return globalForKey.auraseaAccount;
}

export function serverAccount() {
  if (!globalForKey.auraseaAccount) throw new Error("The attestation wallet is not ready");
  return globalForKey.auraseaAccount;
}

export async function signReceipt(input: {
  action: string;
  address: string;
  amount: number;
  ref: string;
  nonce: string;
}) {
  const message = receiptMessage(input);
  const signature = await serverAccount().signMessage({ message });
  return { message, signature };
}
