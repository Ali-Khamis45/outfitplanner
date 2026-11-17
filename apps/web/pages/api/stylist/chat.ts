import { createChatHandler } from "../../../lib/stylist/chat.ts";
export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };
export default createChatHandler();
