import type { Metadata } from "next";
import { StylistPage } from "../../components/stylist/StylistPage";
import "../wardrobe/wardrobe.css";
import "../planning.css";
export const metadata: Metadata = { title: "Stylist | Virtual Wardrobe" };
export default function Page() { return <StylistPage />; }
