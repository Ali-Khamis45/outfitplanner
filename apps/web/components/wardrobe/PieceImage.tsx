/* Private local images deliberately bypass the image optimizer. */
/* eslint-disable @next/next/no-img-element */
import type { WardrobeItem } from "../../lib/wardrobe/schema";
import { TemplateThumbnail } from "./TemplateThumbnail";
export function PieceImage({ item }: { item: WardrobeItem }) {
  return item.photo && !item.texture ? <img src={`/api/wardrobe?photo=${encodeURIComponent(item.photo.split("/").pop() ?? "")}`} alt={item.name} loading="lazy" /> : <TemplateThumbnail item={item} />;
}
export function canTryOn(item: WardrobeItem) { return (item.category === "top" && item.template === "tshirt-v5.2") || (item.category === "bottom" && ["pants-v2", "pants-basic-v2"].includes(item.template ?? "")); }
export function itemTryOnUrl(item: WardrobeItem) { return `/try-on?${new URLSearchParams({ [item.category === "top" ? "top" : "bottom"]: item.id })}`; }
