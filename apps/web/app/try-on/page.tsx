import type { Metadata } from "next";
import { TryOn } from "../../components/try-on/TryOn";
import "./try-on.css";

export const metadata: Metadata = { title: "Try on | Virtual Wardrobe", description: "Explore your outfit in 3D." };
export default function TryOnPage() { return <TryOn />; }
