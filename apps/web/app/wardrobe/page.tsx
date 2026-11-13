import type { Metadata } from "next";
import { WardrobePage } from "../../components/wardrobe/WardrobePage";
import "./wardrobe.css";
export const metadata: Metadata = { title: "Wardrobe | Virtual Wardrobe", description: "Your pieces and outfits." };
export default function Page() { return <WardrobePage />; }
