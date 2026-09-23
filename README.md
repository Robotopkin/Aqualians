# AuraSea

Aqualians is a daily prediction game. Players stake Aura on which of four sectors will move, then share the losing pool.

## Run

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000. Keys live in `.env.local` in this folder (copy from `.env.example`). With an empty `NANSEN_API_KEY` the tide is synthetic and every new wallet is a shrimp. Paste a key from https://app.nansen.ai/api and restart. X login needs `X_CLIENT_ID` and `X_CLIENT_SECRET` from https://developer.x.com, with callback `http://localhost:3000/api/auth/x/callback`. Followers do not change the role.

Keep the Node process running. Readings, the close of betting, and payouts happen inside it. A sleeping serverless function will not keep the clock. `GET /api/cron` can wake one tick if you add an external ping later.

---

## For Nansen judges

AuraSea is a parimutuel prediction game. Two markets run every day on UTC boundaries. Nansen data decides the outcome. Players do not call Nansen. The server does, caches the result, and every browser reads the same numbers.

### Markets

| Market | Open bets | Still measuring | Settle |
| --- | --- | --- | --- |
| Whale Hunt — sector volume | 00:00–12:00 | 12:00–24:00 | 00:00 |
| Shrimp Gather — trade count | 12:00–24:00 | 00:00–12:00 | 12:00 |

Each round draws 4 sectors from NFT, DeFi, Meme, Stablecoin, AI, RWA, Gaming, and one scoring mode. Volume rounds score the relative change in volume. Transaction-count rounds score the relative change in transaction count.

- **Growth** — 1st is the biggest gain. If every category is down, 1st is the smallest drop. The round asks which category takes one place: 1st, 2nd, 3rd, or 4th.
- **Movement** — 1st is the largest absolute percent, up or down. 4th is the smallest move. The round asks for one place the same way.

Relative change is the whole point: raw Stablecoin volume would win every absolute comparison. Stablecoins are excluded from the other sector queries.

The open print is the first server reading after the round starts (1h token-screener window). The live print is the latest reading of that same window. Nansen's cheap screener is a rolling window, not a custom historical accumulator, so the game predicts how the current hour compares with the opening hour. That is what moves on screen during the day.

### Roles, checked once per wallet

| Role | Rule | Ability |
| --- | --- | --- |
| Shrimp | fallback | Shrimp-only stake split. Stays 25/25/25/25 until 10 shrimp bets |
| Dolphin | 14 active days in the last 30 | Yesterday's result for the categories on the board |
| Shark | 90-day win rate ≥ 40% | A winning stake of 100 is weighted as 105 |
| Whale | 90-day traded volume ≥ $10,000 | 300 Aura per day, and the option whales backed most is highlighted for everyone |

Priority is whale, then shark, then dolphin, then shrimp.

**Dropped on purpose:** Nansen premium labels cost 500 credits and common labels cost 100. Public Figure is not queried. Whale is traded volume only, not wallet balance. Say so in the recording; it is a credit decision, not a missing feature.

X is a unique handle bound into the wallet signature. A bearer token, when set, only checks that the account exists.

### Credit budget

Board polls use `POST /api/v1/token-screener` (1 credit). One call covers up to 5 chains and one sector. The server round-robins the sectors that are actually on the board and spreads `NANSEN_DAILY_CALL_BUDGET` (default 1500) across the UTC day. Default pace is about one call a minute, so a day of uptime clears the buildathon's 1,000-call mark without a per-player fan-out.

A new wallet spends a few extra 1-credit profiler calls, capped at 6:

1. `profiler/address/pnl` for bought + sold USD over 90 days. At $10,000 the wallet is a whale and the rest is skipped.
2. `profiler/address/pnl-summary` (90 days), for shark
3. `profiler/address/transactions` (30 days, at most 2 pages), for dolphin

Registration is never charged to the board budget, and it still counts toward the call total shown in the footer.

### Payout and anti-farm

Aura is an off-chain balance. Entering and betting require `personal_sign`. No gas, no transfer. Every grant, lock, payout, and referral is signed by a server attestation key (`SERVER_WALLET_PRIVATE_KEY` or `data/server-wallet.json`). That key must not hold funds. It never broadcasts a transaction.

Losers' stakes are split across winning stakes by weight. Shark weight is stake × 1.05. If nobody hits, stakes are returned. A referrer is minted an extra 10% of the referral's profit. Nothing is taken out of the winner's pocket. Missed days do not stack: 100 Aura (300 for a whale) once per UTC day, starting on the day you enter.

### Run it in under 10 minutes

```bash
npm install
cp .env.example .env.local
# put NANSEN_API_KEY in .env.local
npm test
npm run dev
```

Open http://localhost:3000. The footer shows Nansen calls today, credits remaining, and the attestation address. Connect an EVM wallet, sign the register message, and the role panel fills from the profiler calls above.

`npm test` checks windows, ranks, the shark weight, the shrimp veil, the whale tie-break, and referrals. It does not hit the network.
