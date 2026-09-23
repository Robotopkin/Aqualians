import fs from "fs";
import os from "os";
import path from "path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { serverPrivateKey } from "./config";
import { receiptMessage } from "./messages";

type Account = ReturnType<typeof privateKeyToAccount>;

const globalForKey = globalThis as unknown as { auraseaAccount?: Account };

function loadAccount(): Account {
  const fromEnv = serverPrivateKey();
  if (fromEnv) {
    const key = (fromEnv.startsWith("0x") ? fromEnv : `0x${fromEnv}`) as `0x${string}`;
    return privateKeyToAccount(key);
  }
  const file = process.env.VERCEL
    ? path.join(os.tmpdir(), "server-wallet.json")
    : path.join(process.cwd(), "data", "server-wallet.json");
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { privateKey: `0x${string}` };
    return privateKeyToAccount(saved.privateKey);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  fs.writeFileSync(file, JSON.stringify({ address: account.address, privateKey }, null, 2));
  console.log(`AuraSea attestation wallet created: ${account.address}`);
  return account;
}

export function serverAccount() {
  if (!globalForKey.auraseaAccount) globalForKey.auraseaAccount = loadAccount();
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
