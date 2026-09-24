# AuraSea

Aqualians is a daily prediction game. Connect a wallet and X, receive Aura, and stake it on which sector takes a set place in that day's move. Correct stakes share the whole pool. Nothing is spent on-chain: the server signs each ledger line.

Two markets run on UTC boundaries.

- **Volume** (Whale Hunt) takes bets from 00:00 to 12:00 and settles at the next 00:00. Sectors are ranked by relative volume change.
- **Transaction count** (Shrimp Gather) takes bets from 12:00 to 00:00 and settles at 12:00. Sectors are ranked by relative transaction-count change.

Each round picks four sectors from NFT, DeFi, Meme, Stablecoin, AI, RWA, and Gaming, and asks for one place, 1st through 4th.

- **Growth** ranks the biggest gain first. If every sector is down, 1st is the smallest drop.
- **Movement** ranks the largest absolute move first. 4th is the smallest move.

Stablecoins are left out of the other sector queries, so raw stablecoin volume cannot win an absolute comparison.

A role is assigned once per wallet. Shrimp see how other shrimp split their stakes. Dolphin sees yesterday for the categories on the board. Shark winning stakes count 5% heavier. The option whales backed most is lit for everyone.

## Nansen

Nansen decides the round and the role. Players never call it.

- Live daily rounds take prints only at 00:00 and 12:00 UTC. Each print covers every distinct sector needed by the round that closes and the round that opens. Sectors are queried separately because the combined screener response does not identify which requested sector each token belongs to; this keeps the ranking correct.
- For each sector, `Volume = Σ(volume)` and `Transaction count = Σ(nof_buys + nof_sells)` across Ethereum, Base, and Robinhood over the 24-hour timeframe. The board keeps only the opening and closing prints and does not show live progress.
- A new wallet is classified once across all chains. The checks run in role priority order and stop immediately on a match: 90-day traded volume of at least $10,000 makes a Whale; otherwise a 90-day win rate of at least 50% makes a Shark; otherwise activity on at least 14 distinct days in the last 30 days makes a Dolphin; everyone else is a Shrimp.
- The default and `AURASEA_ROUND_MS=0` both use the live 24-hour schedule. Set an explicit millisecond duration only for local simulated tests. `AURASEA_LAUNCH_AT` can hold a one-time UTC midnight gate for a clean launch; the transaction-count tide opens 12 hours later. `NANSEN_ENABLED=0` disables every Nansen call even when a key is present.
