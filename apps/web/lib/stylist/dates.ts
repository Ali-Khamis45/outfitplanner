import { InputError, validDate } from "./core.ts";
export const normalize = (text: string) => text.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/[\u064B-\u065F]/g, "").replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));
export function replyLanguage(message: string): "en" | "arz" {
  if (/reply in english|answer in english|بالانجليزي|بالإنجليزي/i.test(message)) return "en";
  if (/reply in arabic|egyptian arabic|بالعربي|بالمصري/i.test(message)) return "arz";
  const ar = message.match(/[\u0621-\u064A]/g)?.length ?? 0, en = message.match(/[a-z]/gi)?.length ?? 0;
  return ar > 0 && ar >= en ? "arz" : "en";
}
export function requestDate(message: string, today: string) {
  const text = normalize(message), explicit = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (explicit) { if (!validDate(explicit)) throw new InputError("Please use a valid date (YYYY-MM-DD)."); return { date: explicit, specified: true }; }
  const shift = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  if (/\btoday\b|النهارده|اليوم/.test(text)) return { date: today, specified: true };
  if (/day after tomorrow|بعد بكره|بعد غد/.test(text)) return { date: shift(2), specified: true };
  if (/\btomorrow\b|بكره|غدا|غد\b/.test(text)) return { date: shift(1), specified: true };
  if (/\byesterday\b|امبارح|امس/.test(text)) return { date: shift(-1), specified: true };
  const days = [/\bsunday\b|الاحد/, /\bmonday\b|الاثنين|الاتنين/, /\btuesday\b|الثلاثاء|التلات/, /\bwednesday\b|الاربعاء|الاربع/, /\bthursday\b|الخميس/, /\bfriday\b|الجمعه/, /\bsaturday\b|السبت/];
  const day = days.findIndex(pattern => pattern.test(text));
  if (day >= 0) {
    let offset = (day - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7;
    if (!offset && /\bnext\b|الجاي|القادم/.test(text)) offset = 7;
    return { date: shift(offset), specified: true };
  }
  return { date: today, specified: false };
}
