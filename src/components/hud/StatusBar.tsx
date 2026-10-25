// Shared wordmark for the manual library.
export default function StatusBar({ right }: { right?: React.ReactNode }) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 pt-[max(1.1rem,env(safe-area-inset-top))] sm:px-8">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <span className="text-[15px] font-semibold tracking-tight">BuildSight<span className="text-sky-300">.</span></span>
      </div>
      <div className="flex items-center gap-4">
        {right}
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-white/45 sm:block">Camera-guided assembly</span>
      </div>
    </header>
  );
}

export function LogoMark() {
  return (
    <span className="relative grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-b from-sky-400/25 to-sky-400/5 ring-1 ring-sky-300/30">
      <span className="absolute inset-[5px] rounded-full border border-dashed border-sky-300/50 spin-fast" />
      <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_10px_2px_rgba(92,200,255,0.8)]" />
    </span>
  );
}
