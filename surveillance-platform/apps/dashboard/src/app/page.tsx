import Link from "next/link";

export default function HomePage() {
  return (
    <section>
      <h1>Welcome</h1>
      <p>Pair a connector to your customer network, then add cameras and view live previews.</p>
      <ul>
        <li>
          <Link href="/connectors">Connectors</Link>
        </li>
        <li>
          <Link href="/cameras">Cameras</Link>
        </li>
        <li>
          <Link href="/pairings/new">Pair a new connector</Link>
        </li>
      </ul>
    </section>
  );
}
