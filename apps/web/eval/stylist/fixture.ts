import { parseWardrobe, type Wardrobe, type WardrobeItem } from "../../lib/wardrobe/schema.ts";
import type { Scenario } from "./scoring.ts";

export const FIXTURE_VERSION = "stylist-eval-v2-quality";
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
export function scenarioWardrobe(scenario: Scenario): Wardrobe {
  const today = scenario.reference_date ?? scenario.date, wardrobe = fixtureWardrobe(today);
  if (scenario.fixture === "gap") wardrobe.items = wardrobe.items.filter(item => item.formality <= 2).map(item => ({ ...item, type: item.category === "top" ? "t-shirt" : "casual trousers", name: item.category === "top" ? `Cotton tee ${item.id}` : `Casual trousers ${item.id}` }));
  if (scenario.fixture === "recent") wardrobe.items = wardrobe.items.map(item => ({ ...item, last_worn: today }));
  if (["cold", "rain"].includes(scenario.fixture ?? "")) {
    wardrobe.items = wardrobe.items.map(item => ({ ...item, last_worn: null, warmth: item.id.endsWith("fresh") ? 1 : item.id.endsWith("recent") ? 2 : 4 }));
    wardrobe.items.push({ ...wardrobe.items[0], id: "eval-outer-shell", category: "outerwear", name: "Rain shell", type: "rain shell", material: "waterproof nylon", template: null, formality: 4, warmth: 1 });
    if (scenario.fixture === "cold") wardrobe.items.push({ ...wardrobe.items[0], id: "eval-outer-coat", category: "outerwear", name: "Warm coat", type: "coat", material: "wool", template: null, formality: 4, warmth: 3 });
  }
  if (scenario.fixture === "while") wardrobe.items = wardrobe.items.map(item => ({ ...item, last_worn: item.id.endsWith("old") ? item.last_worn : new Date(Date.parse(`${today}T12:00:00Z`) - 10 * 86400000).toISOString().slice(0, 10) }));
  return parseWardrobe(wardrobe);
}
