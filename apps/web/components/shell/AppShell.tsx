"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowUpRight, CalendarBlank, CoatHanger, House, SquaresFour, Sparkle, UserCircle, PersonSimple } from "@phosphor-icons/react";
import { MeasurementsForm } from "../FitControls";
import { Panel } from "./Panel";

const destinations = [
  { href: "/", label: "Home", mobile: "Home", icon: House },
  { href: "/wardrobe", label: "Wardrobe", mobile: "Wardrobe", icon: CoatHanger },
  { href: "/try-on", label: "Fitting room", mobile: "Try-on", icon: PersonSimple },
  { href: "/outfits", label: "Outfits", mobile: "Outfits", icon: SquaresFour },
  { href: "/stylist", label: "Stylist", mobile: "Stylist", icon: Sparkle },
  { href: "/planner", label: "Planner", mobile: "Planner", icon: CalendarBlank },
];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState(false);
  return <div className="app-shell">
    <a className="skip-link" href="#app-content">Skip to content</a>
    <header className="app-header">
      <Link href="/" className="app-brand" aria-label="Virtual Wardrobe home"><span className="app-monogram">v<span>.</span></span><span>virtual<br />wardrobe</span></Link>
      <nav className="desktop-nav" aria-label="Main navigation">{destinations.map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>)}</nav>
      <div className="app-header-actions"><Link className="mobile-planner icon-button" href="/planner" aria-label="Planner" aria-current={pathname === "/planner" ? "page" : undefined}><CalendarBlank size={22} /></Link><button className="profile-button" type="button" aria-label="Open fit profile" aria-haspopup="dialog" onClick={() => setProfile(true)}><UserCircle size={26} weight="light" /><span>Profile</span></button></div>
    </header>
    <div id="app-content" tabIndex={-1}>{children}</div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{destinations.slice(0, 5).map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}><item.icon size={22} weight={pathname === item.href ? "fill" : "regular"} /><span>{item.mobile}</span></Link>)}</nav>
    {profile && <Panel title="Your fit profile" onClose={() => setProfile(false)}><p className="muted">Your measurements stay on this device. Use your personal avatar in the fitting room to explore the fit.</p><Link className="button-primary" href="/try-on#avatar" onClick={() => setProfile(false)}>Open fitting room <ArrowUpRight size={18} /></Link><MeasurementsForm /><div className="profile-links"><Link href="/planner" onClick={() => setProfile(false)}>Outfit planner <ArrowUpRight size={18} /></Link><Link href="/lab" onClick={() => setProfile(false)}>Avatar lab <ArrowUpRight size={18} /></Link></div></Panel>}
  </div>;
}
