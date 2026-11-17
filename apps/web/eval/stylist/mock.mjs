import { completion, startMockModel, toolCall } from "../../tests/mock-stylist-model.mjs";

// An oracle for testing harness plumbing, NOT evidence of model quality. Expected
// ranges are used only here; run.mjs never includes expectations in real prompts.
export function startEvaluationModel(scenarios) {
  const byMessage = new Map(scenarios.map(s => [s.message, s]));
  return startMockModel(body => {
    const scenario = byMessage.get(body.messages.findLast(message => message.role === "user")?.content);
    if (!scenario) throw new Error("Unknown mock scenario");
    const results = body.messages.filter(message => message.role === "tool");
    if (!results.length) {
      const filter = { formality_min: scenario.expect.formality_range[0], formality_max: scenario.expect.formality_range[1] };
      if (scenario.expect.not_worn_days !== null) filter.not_worn_days = scenario.expect.not_worn_days;
      const calls = [toolCall("get_wardrobe", { filter })];
      if (scenario.expect.must_call_get_weather) calls.push(toolCall("get_weather", { date: scenario.date, city: scenario.city }));
      return completion(null, calls);
    }
    if (!results.some(result => result.tool_call_id === "show_on_avatar")) {
      const wardrobe = JSON.parse(results.find(result => result.tool_call_id === "get_wardrobe").content);
      const top = wardrobe.find(item => item.category === "top"), bottom = wardrobe.find(item => item.category === "bottom");
      return completion(null, [toolCall("show_on_avatar", { item_ids: [top.id, bottom.id] })]);
    }
    return completion(scenario.language === "arz" ? "ده طقم من دولاب التجربة مناسب للمناسبة اللي طلبتها." : "This look from the evaluation wardrobe fits the requested occasion.");
  });
}
