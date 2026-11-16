/* These private local images must bypass the Next image optimizer. */
/* eslint-disable @next/next/no-img-element */
import type { RecommendationItem } from "../../lib/stylist/chatTypes";
import { TemplateThumbnail } from "./TemplateThumbnail";

export function LookItems({ items }: { items: RecommendationItem[] }) {
  return <div className="look-items">{items.map(item => <figure key={item.id}><div className="look-thumbnail">
    {item.photo ? <img src={`/api/wardrobe?photo=${encodeURIComponent(item.photo.split("/").pop() ?? "")}`} alt={item.name} /> : <TemplateThumbnail item={item} />}
  </div><figcaption>{item.name}</figcaption></figure>)}</div>;
}
