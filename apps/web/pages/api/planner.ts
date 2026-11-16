import { createPlannerHandler } from "../../lib/planner/api.ts";
export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };
export default createPlannerHandler();
