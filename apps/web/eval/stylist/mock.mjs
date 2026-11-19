import { completion, startMockModel } from "../../tests/mock-stylist-model.mjs";

// Oracle for harness plumbing only, never evidence of model quality.
export function startEvaluationModel(scenarios) {
  const byMessage = new Map(scenarios.map(s => [s.message, s]));
  return startMockModel(body => {
    const scenario = byMessage.get(body.messages.findLast(message => message.role === "user")?.content);
    if (!scenario) throw new Error("Unknown mock scenario");
    const properties = body.response_format.json_schema.schema.properties;
    const reason = scenario.language === "arz" ? "\u062f\u0647 \u0637\u0642\u0645 \u0645\u0646\u0627\u0633\u0628 \u0644\u0644\u0645\u0646\u0627\u0633\u0628\u0629." : "This look suits the requested occasion.";
    return completion(JSON.stringify({ top_id: properties.top_id.enum[0], bottom_id: properties.bottom_id.enum[0], outer_id: null,
      occasion: scenario.expect.occasion, formality: properties.formality.enum[0], reason, weather_note: null, language: scenario.language }));
  });
}
