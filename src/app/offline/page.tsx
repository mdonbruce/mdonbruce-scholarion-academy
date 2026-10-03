import type { Metadata } from "next";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

export default function Page() {
  return (
    <main id="main" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16, background: "#f6f8fc" }}>
      <div className="card card-pad" style={{ maxWidth: 440, textAlign: "center" }}>
        <img src="/brand/scholarion-emblem.png" alt="Scholarion Academy" width={86} height={60} />
        <h1 style={{ fontFamily: "var(--font-sans)", fontSize: "1.4rem" }}>You're offline</h1>
        <p className="muted">Scholarion needs a connection to load your courses, labs and progress. Anything you already saved is safe.</p>
        <a className="btn btn-primary" href="/">
          Try again
        </a>
      </div>
    </main>
  );
}
