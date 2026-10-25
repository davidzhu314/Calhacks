"use client";

import Image from "next/image";
import { useState } from "react";

// Product photo: loaded near the viewport (unless priority). If an external CDN is unavailable,
// the tile shows a readable fallback instead of keeping an endless loading shimmer.
export default function ProductImage({
  src,
  sizes,
  padded = true,
  priority = false,
  className = "",
}: {
  src: string;
  sizes: string;
  padded?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // LEGO/IKEA CDNs ignore resize params; drop them so the optimizer's allow-list matches.
  const clean = src.split("?")[0];
  return (
    <>
      <span aria-hidden className={`absolute inset-0 bg-white transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`} />
      {!loaded && !failed && <span aria-hidden className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.06] to-white/[0.02]" />}
      {failed && <span className="absolute inset-0 grid place-items-center bg-[#162638] px-4 text-center font-mono text-[10px] uppercase tracking-widest text-white/50">Image unavailable</span>}
      <Image
        src={clean}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={clean.includes("lego.com") || clean.includes("ikea.com")}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`object-contain transition duration-500 ${padded ? "p-3" : ""} ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
      />
    </>
  );
}
