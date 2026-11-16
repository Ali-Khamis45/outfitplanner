import Link from "next/link";

export function CollectionNav() {
  return <header className="wardrobe-nav"><Link href="/try-on" className="wardrobe-brand">v<span>.</span> <small>virtual<br />wardrobe</small></Link>
    <nav aria-label="Your wardrobe"><Link href="/wardrobe">WARDROBE</Link><Link href="/planner">PLANNER</Link><Link href="/stylist">STYLIST</Link><Link href="/try-on">THE FITTING ROOM</Link></nav>
  </header>;
}
