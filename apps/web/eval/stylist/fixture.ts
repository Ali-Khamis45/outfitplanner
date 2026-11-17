import { parseWardrobe, type Wardrobe, type WardrobeItem } from "../../lib/wardrobe/schema.ts";

export const FIXTURE_VERSION = "stylist-eval-v1";
export function fixtureWardrobe(referenceDate: string): Wardrobe {
  const items: WardrobeItem[] = [];
  const names = ["Sport", "Casual", "Office", "Business", "Formal"];
  for (let formality = 1; formality <= 5; formality++) {
    for (const category of ["top", "bottom"] as const) {
      for (const freshness of ["fresh", "recent", "old"] as const) {
        const age = freshness === "recent" ? 1 : 45;
        const lastWorn = new Date(Date.parse(`${referenceDate}T00:00:00Z`) - age * 86400000).toISOString().slice(0, 10);
        items.push({ id: `eval-${category}-${formality}-${freshness}`, name: `${names[formality - 1]} ${category} (${freshness})`, category,
          type: category === "top" ? "top" : "trousers", template: category === "top" ? "tshirt-v5.2" : "pants-v2",
          colors: [{ name: category === "top" ? "navy" : "moss", hex: category === "top" ? "#1F2A44" : "#777f69", share: 1 }],
          pattern: "solid", material: "cotton", formality, warmth: 2, seasons: ["spring", "summer", "autumn", "winter"],
          occasions: ["sport", "casual", "work", "business", "formal", "outing", "travel"], size: "M", photo: "", added_at: "2020-01-01",
          last_worn: freshness === "fresh" ? null : lastWorn, times_worn: freshness === "fresh" ? 0 : 1, favorite: false, notes: "" });
      }
    }
  }
  return parseWardrobe({ version: 1, items, outfits: [] });
}
