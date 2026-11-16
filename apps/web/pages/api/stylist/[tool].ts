import { createStylistHandler } from "../../../lib/stylist/api.ts";
export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };
export default createStylistHandler();
