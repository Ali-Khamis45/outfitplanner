import type { Metadata } from "next";
import { WardrobePage } from "../../components/wardrobe/WardrobePage";
import "../wardrobe/wardrobe.css";
export const metadata: Metadata = { title: "Outfits | Virtual Wardrobe" };
// Existing outfit builder; its redesign is reserved for a later phase.
export default function Page() { return <WardrobePage outfitsOnly />; }
