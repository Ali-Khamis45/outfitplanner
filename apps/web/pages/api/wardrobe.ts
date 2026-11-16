import { createWardrobeHandler } from "../../lib/wardrobeApi";
export const config = { api: { bodyParser: { sizeLimit: "14mb" } } };
export default createWardrobeHandler();
