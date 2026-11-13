import { createWardrobeHandler } from "../../lib/wardrobeApi";
export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };
export default createWardrobeHandler();
