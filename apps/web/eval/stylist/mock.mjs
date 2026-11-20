import { completion, startMockModel } from "../../tests/mock-stylist-model.mjs";
import { scenarioWardrobe } from "./fixture.ts";
import { qualityChecks } from "./quality.ts";
import { evaluationWeather } from "../../lib/stylist/evaluation.ts";

// Oracle for harness plumbing only, never evidence of model quality.
export function startEvaluationModel(scenarios) {
  const byMessage = new Map(scenarios.map(s => [s.message, s]));
  return startMockModel(async body => {
    const s = byMessage.get(body.messages.findLast(message => message.role === "user")?.content);
    if (!s) throw new Error("Unknown mock scenario");
    if (body.response_format.json_schema.name === "stylist_intent") return completion(JSON.stringify(s.intent_labels));
    const p = body.response_format.json_schema.schema.properties, wardrobe = scenarioWardrobe(s);
    const forecast = s.forecast ?? (s.expect.must_call_get_weather ? await evaluationWeather({date:s.date,city:s.city}) : null);
    const arabic = s.language === "arz";
    for (const top_id of p.top_id.enum) for (const bottom_id of p.bottom_id.enum) for (const outer_id of p.outer_id.enum) for (const gap of [false,true]) {
      const look = {top_id,bottom_id,outer_id,occasion:s.expect.occasion,date:s.date,language:s.language,
        formality:Math.min(...wardrobe.items.filter(i=>[top_id,bottom_id].includes(i.id)).map(i=>i.formality)),
        reason:arabic ? "\u062f\u0647 \u0637\u0642\u0645 \u0645\u0646\u0627\u0633\u0628." : "This look suits the occasion.",
        gap_note:p.gap_note.enum ? p.gap_note.enum[0] : gap ? arabic ? "\u062f\u0647 \u0623\u0642\u0631\u0628 \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u062a\u0627\u062d." : "This is the closest available option." : null,
        weather_note:p.weather_note.enum?.[0] ?? null};
      if (s.id.startsWith("conversation-")) return completion(JSON.stringify(look));
      if(qualityChecks(s,wardrobe,{structured:look,evaluation:{forecast,pipeline:"v2.1",intent:s.intent_labels}},true).every(c=>c.status!=="FAIL")) return completion(JSON.stringify(look));
    }
    throw new Error("No mock quality solution for " + s.id);
  });
}
