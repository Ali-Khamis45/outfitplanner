import { createWardrobeHandler } from "../../lib/wardrobeApi";
import { localOutputs } from "../../lib/localOutputs";
export const config = { api: { bodyParser: { sizeLimit: "14mb" } } };
export default createWardrobeHandler(localOutputs());
