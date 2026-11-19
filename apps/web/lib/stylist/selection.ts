import type { WardrobeItem } from "../wardrobe/schema.ts";
import type { Intent } from "./pipeline.ts";
import { eligibleItems, recentlyWorn } from "./pipeline.ts";
import { record } from "./core.ts";

export type Selection = { tops: WardrobeItem[]; bottoms: WardrobeItem[]; outers: WardrobeItem[]; allowNoOuter: boolean; gap_note: string | null; thermal: boolean; target: number | null };
const rainShell = (i: WardrobeItem) => /waterproof|rain|shell|مطر|مقاوم للماء/i.test(`${i.type} ${i.material}`);
// Shared production/evaluation policy. Passing these checks is enforcement,
// not evidence that the model can reason about formality or temperatures.
export function selectCandidates(items: WardrobeItem[], intent: Intent, forecast: unknown): Selection {
  let tops = eligibleItems(items, intent, "top"), bottoms = eligibleItems(items, intent, "bottom"), outers = eligibleItems(items, intent, "outerwear");
  const weather = record(forecast) && forecast.date === intent.date && typeof forecast.temperature_max_c === "number" ? forecast : null;
  const weatherTarget = weather ? Number(weather.temperature_max_c) <= 15 ? 4 : Number(weather.temperature_max_c) >= 28 ? 1 : 2 : null;
  const target = intent.warmer ? Math.min(5, (weatherTarget ?? 2) + 1) : weatherTarget;
  const rain = !!weather && intent.indoor_outdoor !== "indoor" && Number(weather.precipitation_probability_percent) >= 50;
  let allowNoOuter = true, warmthGap = false;
  if (target !== null && tops.length && bottoms.length) {
    // Select one optimal thermal group so EVERY cross-product of the enums is
    // valid. A union of optimal top/coat pairs could permit invalid pairings.
    const coats: (WardrobeItem | null)[] = rain && outers.some(rainShell) ? outers.filter(rainShell) : [null, ...outers];
    const groups = [...new Set(tops.map(i => i.warmth))].flatMap(top => [...new Set(coats.map(i => i?.warmth ?? 0))].map(outer => ({ top, outer, loss: Math.abs(Math.min(5, top + outer) - target) })));
    groups.sort((a, b) => a.loss - b.loss || (intent.warmer ? (b.top + b.outer) - (a.top + a.outer) : a.outer - b.outer || a.top - b.top));
    const best = groups[0];
    tops = tops.filter(i => i.warmth === best.top);
    outers = coats.filter((i): i is WardrobeItem => !!i && i.warmth === best.outer);
    allowNoOuter = best.outer === 0;
    const lowerLoss = Math.min(...bottoms.map(i => Math.abs(i.warmth - target)));
    bottoms = bottoms.filter(i => Math.abs(i.warmth - target) === lowerLoss);
    if (intent.warmer) { const warmest = Math.max(...bottoms.map(i => i.warmth)); bottoms = bottoms.filter(i => i.warmth === warmest); }
    warmthGap = best.loss > 0 || lowerLoss > 0 || rain && !outers.some(rainShell);
  } else { outers = []; }
  const all = [...tops, ...bottoms, ...outers];
  const formalGap = all.some(i => i.formality < intent.range[0] || i.formality > intent.range[1]);
  const recentGap = all.some(i => recentlyWorn(i, intent.today, intent.days));
  const ar = intent.language === "arz", notes = [];
  if (formalGap) notes.push(ar ? "دولابك مفيهوش قطع بدرجة الرسمية المطلوبة لكل جزء من الطقم؛ دي أعلى درجة متاحة، ومش معناها إن قطعة كاجوال بقت رسمية." : "Your wardrobe cannot meet the requested formality in every slot; these are the highest-formality available pieces. A casual piece is still casual.");
  if (warmthGap && weather) notes.push(ar ? "القطع المتاحة مش مناسبة تمامًا لدرجة الحرارة أو المطر المتوقعين؛ ده أقرب اختيار متاح وممكن تحتاج طبقة أنسب للجو." : "The available pieces cannot fully match the forecast warmth or rain protection; this is the closest available combination and you may need a more suitable layer.");
  if (recentGap) notes.push(ar ? "مفيش بديل مناسب متلبسش قريب، فلازم نكرر قطعة اتلبست مؤخرًا." : "No suitable unworn alternative is available, so this repeats recently worn clothing.");
  return { tops, bottoms, outers, allowNoOuter, gap_note: notes.length ? notes.join(" ") : null, thermal: !!weather, target };
}
export function selectionContains(selection: Selection, look: { top_id?: unknown; bottom_id?: unknown; outer_id?: unknown }) {
  return selection.tops.some(i => i.id === look.top_id) && selection.bottoms.some(i => i.id === look.bottom_id) && (look.outer_id === null ? selection.allowNoOuter : selection.outers.some(i => i.id === look.outer_id));
}
