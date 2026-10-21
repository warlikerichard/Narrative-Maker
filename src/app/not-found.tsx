import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone-state">
      <span className="eyebrow">UNCHARTED TERRITORY</span>
      <h1>This page hasn’t been written.</h1>
      <p>The project may have been deleted, or you may not have access.</p>
      <Link href="/" className="button primary">
        Back to my projects
      </Link>
    </main>
  );
}
