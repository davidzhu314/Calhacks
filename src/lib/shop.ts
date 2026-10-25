// "Missing a part?" shopping links. BuildSight doesn't sell or take payment: these open real stores in a new tab,
// searched for the missing part. LEGO and IKEA also get their official replacement-part pages.
// Run the tests with: npm run test:shop

import type { ManualSource } from "@/lib/manuals";

export type ShopLink = { store: string; label: string; url: string; note?: string };

type Input = {
  source: ManualSource;
  part: string; // "red 2x4 brick"
  description?: string; // "2x4 red brick" (the part's visual_description, when the manual reading has one)
  title?: string; // manual title: "Exotic Parrot", "KALLAX"
  subtitle?: string; // "LEGO 31136 · Book 1 of 3"
};

const tidy = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const q = (s: string) => encodeURIComponent(tidy(s));

/** The LEGO set number from a subtitle like "LEGO 31136 · Book 1 of 3". */
export function setNumber(subtitle?: string): string | null {
  return subtitle?.match(/\bLEGO\s+(\d{4,7})\b/i)?.[1] ?? null;
}

/** Where to buy (or request) a missing part, best option first. */
export function shopLinks({ source, part, description, title, subtitle }: Input): ShopLink[] {
  const name = tidy(description) || tidy(part);
  if (!name) return [];
  if (source === "lego") {
    const set = setNumber(subtitle);
    const search = /\blego\b/i.test(name) ? name : `LEGO ${name}`;
    return [
      {
        store: "LEGO",
        label: "Request a replacement",
        url: "https://www.lego.com/en-us/service/replacement-parts",
        note: set ? `LEGO's official service for missing or broken pieces. Have set ${set} handy.` : "LEGO's official service for missing or broken pieces.",
      },
      { store: "BrickLink", label: "Buy on BrickLink", url: `https://www.bricklink.com/v2/search.page?q=${q(name)}`, note: "Marketplace for single LEGO pieces." },
      { store: "Google Shopping", label: "Compare prices", url: `https://www.google.com/search?tbm=shop&q=${q(search)}` },
    ];
  }
  // IKEA and uploaded manuals: name the product too, so "short wooden dowel" finds the right hardware
  const product = tidy(title);
  const search = product && !name.toLowerCase().includes(product.toLowerCase()) ? `${product} ${name}` : name;
  const general: ShopLink[] = [
    { store: "Google Shopping", label: "Compare prices", url: `https://www.google.com/search?tbm=shop&q=${q(search)}` },
    { store: "Amazon", label: "Search Amazon", url: `https://www.amazon.com/s?k=${q(search)}` },
  ];
  if (source === "ikea") {
    return [
      {
        store: "IKEA",
        label: "Order a spare part",
        url: "https://www.ikea.com/us/en/customer-service/spare-parts/",
        note: "IKEA's official spare parts. The part number is printed next to the part in the manual.",
      },
      ...general,
    ];
  }
  return general;
}
