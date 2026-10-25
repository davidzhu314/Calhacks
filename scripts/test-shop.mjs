// Checks the "missing a part?" shopping links (src/lib/shop.ts). Run: npm run test:shop
import { setNumber, shopLinks } from "../src/lib/shop.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  — ${detail}` : ""}`);
};

check("set number from subtitle", setNumber("LEGO 31136 · Book 1 of 3") === "31136");
check("no set number for IKEA", setNumber("IKEA · Assembly instructions") === null);

const lego = shopLinks({ source: "lego", part: "red brick", description: "2x4 red brick", subtitle: "LEGO 31136 · Book 1 of 3" });
check("LEGO: official replacement first", lego[0].store === "LEGO" && lego[0].url.startsWith("https://www.lego.com/"));
check("LEGO: note names the set", lego[0].note?.includes("31136"));
check("LEGO: BrickLink searches the visual description", lego[1].url === "https://www.bricklink.com/v2/search.page?q=2x4%20red%20brick", lego[1].url);
check("LEGO: Google adds 'LEGO'", lego[2].url.endsWith("q=LEGO%202x4%20red%20brick"), lego[2].url);
check("LEGO: falls back to the name", shopLinks({ source: "lego", part: "  blue   plate " })[1].url.endsWith("q=blue%20plate"));

const ikea = shopLinks({ source: "ikea", part: "short wooden dowel", title: "KALLAX" });
check("IKEA: official spare parts first", ikea[0].store === "IKEA" && ikea[0].url.includes("ikea.com"));
check("IKEA: search names the product", ikea[1].url.endsWith("q=KALLAX%20short%20wooden%20dowel"), ikea[1].url);
check("IKEA: Amazon too", ikea.some((l) => l.store === "Amazon"));

const upload = shopLinks({ source: "upload", part: "M6 hex bolt", title: "Garden shed" });
check("upload: general stores only", upload.map((l) => l.store).join() === "Google Shopping,Amazon");
check("upload: special characters are encoded", shopLinks({ source: "upload", part: "1/4\" washer & nut" })[0].url.includes("1%2F4%22%20washer%20%26%20nut"));
check("no part name, no links", shopLinks({ source: "lego", part: " " }).length === 0);
check("every link is https", [...lego, ...ikea, ...upload].every((l) => l.url.startsWith("https://")));

console.log(`\n${failed ? "FAILED" : "all passed"}`);
process.exit(failed ? 1 : 0);
