import { createThumbnailHandler } from "../../lib/wardrobeThumbnailApi";
import type { NextApiRequest, NextApiResponse } from "next";
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
const handler = createThumbnailHandler();
export default async function thumbnailRoute(req: NextApiRequest, res: NextApiResponse) { await handler(req, res); }
