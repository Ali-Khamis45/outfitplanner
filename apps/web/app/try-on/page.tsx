import type { Metadata } from "next";
import { TryOn } from "../../components/try-on/TryOn";
import "./try-on.css";

export const metadata: Metadata = { title: "Try on | Virtual Wardrobe", description: "Explore your outfit in 3D." };
export default async function TryOnPage({ searchParams }: { searchParams: Promise<{ fixtures?: string; outfit?: string }> }) {
  const params = await searchParams;
  const fixtures = process.env.NODE_ENV === "development" && params.fixtures === "1";
  return <TryOn fixtures={fixtures} outfitId={params.outfit ?? null} />;
}
