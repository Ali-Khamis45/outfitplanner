import { createChatHandler } from "../../../lib/stylist/chat.ts";
import { evaluationWeather } from "../../../lib/stylist/evaluation.ts";
export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };
const evaluation = process.env.STYLIST_EVAL === "1";
export default createChatHandler({ evaluation, weather: evaluation && process.env.STYLIST_EVAL_MOCK === "1" ? evaluationWeather : undefined });
