# AuraSea

Aqualians is a daily prediction game. Connect a wallet and X, receive Aura, and stake it on which sector takes a set place in that day's move. Correct stakes share the losing pool. Nothing is spent on-chain: the server signs each ledger line.

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

- Each round keeps an opening print and a closing print. The server asks the token screener once per sector that is actually in play, then compares those two prints. The board does not show a live percent during the day.
- A new wallet is classified once, from 90-day traded volume, then win rate, then recent active days. The calls stop as soon as the role is known.
- Readings stay off until `NANSEN_ENABLED=1`.
