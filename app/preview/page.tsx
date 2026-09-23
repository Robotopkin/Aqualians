import Link from "next/link";
import SeaBackground from "@/components/SeaBackground";
import TideNum from "@/components/TideNum";

export default function PreviewPage() {
  return (
    <>
      <SeaBackground />
      <main className="page">
        <header className="top">
          <div className="brand">
            <div className="eyebrow">Sample rows</div>
            <Link href="/" className="title-link">
              <h1>Aqualians</h1>
            </Link>
          </div>
        </header>
        <p className="meta">Not a live round. Open this page to see each role’s mark without holding that role.</p>
        <section className="rounds">
          <article className="card">
            <div className="kicker">Shrimp</div>
            <h2>Stake split</h2>
            <div className="option">
              <div className="option-head">
                <h3>NFT</h3>
                <div className="role-mark">
                  <span>62%</span>
                  <img src="/roles/shrimp.png" alt="" className="role-icon" />
                </div>
              </div>
              <div className="staked-label">Aura staked</div>
              <TideNum value="1,250" />
            </div>
            <p className="meta">Until 10 shrimp bets, every category shows 25%.</p>
          </article>
          <article className="card">
            <div className="kicker">Dolphin</div>
            <h2>Yesterday</h2>
            <div className="option">
              <div className="option-head">
                <h3>DeFi</h3>
                <div className="role-mark">
                  <span>+4.2% · 1st</span>
                  <img src="/roles/dolphin.png" alt="" className="role-icon" />
                </div>
              </div>
              <div className="staked-label">Aura staked</div>
              <TideNum value="80" />
            </div>
          </article>
          <article className="card">
            <div className="kicker">Whale</div>
            <h2>Where whales put Aura</h2>
            <div className="option whale">
              <div className="option-head">
                <h3 className="whale-name">Meme</h3>
              </div>
              <div className="staked-label">Aura staked</div>
              <TideNum value="500" />
            </div>
            <p className="meta">The blue name is the category with the most whale Aura. A tie goes to more unique whales. Everyone sees it.</p>
          </article>
          <article className="card">
            <div className="kicker">Shark</div>
            <h2>Heavier win</h2>
            <div className="option">
              <div className="option-head">
                <h3>AI</h3>
                <img src="/roles/shark.png" alt="" className="role-icon" />
              </div>
              <div className="staked-label">Aura staked</div>
              <TideNum value="100" />
            </div>
            <p className="meta">No extra mark on the row. A winning stake of 100 is paid as if it were 105. The extra comes from the losing pool.</p>
          </article>
        </section>
      </main>
    </>
  );
}
