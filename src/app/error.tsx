"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone-state">
      <span className="eyebrow">A SMALL DETOUR</span>
      <h1>We couldn’t load your workspace.</h1>
      <p>Please try again. Your saved work is still in the database.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
