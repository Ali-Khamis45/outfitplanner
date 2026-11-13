import type { Metadata } from "next";
import { TryOn } from "../../components/try-on/TryOn";
import "./try-on.css";

export const metadata: Metadata = { title: "Try on | Virtual Wardrobe", description: "Explore your outfit in 3D." };
export default async function TryOnPage({ searchParams }: { searchParams: Promise<{ fixtures?: string; "texture-fixture"?: string; outfit?: string; top?: string; bottom?: string }> }) {
  const params = await searchParams;
  const fixtures = process.env.NODE_ENV === "development" && params.fixtures === "1";
  return <TryOn textureFixture={process.env.NODE_ENV === "development" && params["texture-fixture"] === "1"} fixtures={fixtures} outfitId={params.outfit ?? null} topId={params.top ?? null} bottomId={params.bottom ?? null} />;
}
