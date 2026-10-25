import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedStep } from "@/app/api/extract/route";
import type { Manual } from "@/lib/manuals";
import type { Prebuilt } from "@/lib/prebuilt";
import BuildView from "./BuildView";

const mocks = vi.hoisted(() => ({
  getManual: vi.fn(), saveManual: vi.fn(), getPageSteps: vi.fn(), savePageSteps: vi.fn(),
  loadPrebuilt: vi.fn(), openManualPdf: vi.fn(), renderPage: vi.fn(), speak: vi.fn(), stopSpeaking: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "manual-1" }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="hologram" /> }));
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
    section: ({ children, className }: { children: React.ReactNode; className?: string }) => <section className={className}>{children}</section>,
    h1: ({ children, className }: { children: React.ReactNode; className?: string }) => <h1 className={className}>{children}</h1>,
  },
}));
vi.mock("@/components/CameraFeed", async () => {
  const React = await import("react");
  return { default: React.forwardRef(function CameraMock(_props, ref) {
    React.useImperativeHandle(ref, () => ({ capture: () => "data:image/jpeg;base64,frame", sample: () => null, geometry: () => null }));
    return <div data-testid="camera" />;
  }) };
});
vi.mock("@/components/ManualPanel", () => ({ default: () => <div data-testid="manual-panel" /> }));
vi.mock("@/components/PieceHologram", () => ({ default: () => <div data-testid="hologram" /> }));
vi.mock("@/components/ZoomViewer", () => ({ default: () => <div data-testid="zoom-viewer" /> }));
vi.mock("@/components/VoicePanel", () => ({ default: () => <div data-testid="voice-panel" /> }));
vi.mock("@/lib/manuals", () => ({
  getManual: mocks.getManual, saveManual: mocks.saveManual, getPageSteps: mocks.getPageSteps, savePageSteps: mocks.savePageSteps,
}));
vi.mock("@/lib/prebuilt", () => ({ loadPrebuilt: mocks.loadPrebuilt }));
vi.mock("@/lib/pdf", () => ({ openManualPdf: mocks.openManualPdf, renderPage: mocks.renderPage }));
vi.mock("@/lib/speech", () => ({ speak: mocks.speak, stopSpeaking: mocks.stopSpeaking }));

const makeStep = (number: number, instruction: string): ExtractedStep => ({
  number, instruction, parts: [{ name: "blue plate", color: "#369ddd", qty: 1, shape: "plate" }],
  watchFor: [], box: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
});
const page5 = [makeStep(1, "Build first piece."), makeStep(2, "Attach second piece.")];
const page7 = [makeStep(2, "Add the third piece."), makeStep(3, "Add the cap.")];
const prebuilt: Prebuilt = { id: "6455750", pageCount: 7, pages: { "1": [], "2": [], "3": [], "4": [], "5": page5, "6": [], "7": page7 } };
const manual: Manual = {
  id: "manual-1", source: "lego", title: "Test build", subtitle: "LEGO", pdfPath: "/manual-pdf/lego/6455750.pdf",
  page: 5, addedAt: 1, openedAt: 1,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: vi.fn(async () => {}) });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,cropped");
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  mocks.getManual.mockResolvedValue({ ...manual });
  mocks.saveManual.mockResolvedValue(undefined);
  mocks.getPageSteps.mockResolvedValue(null);
  mocks.savePageSteps.mockResolvedValue(undefined);
  mocks.loadPrebuilt.mockResolvedValue(prebuilt);
  mocks.openManualPdf.mockResolvedValue({ numPages: 3 });
  mocks.renderPage.mockResolvedValue("data:image/jpeg;base64,page");
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input === "/api/check") return { ok: true, json: async () => ({ confidence: 0.95, step_complete: true, issues: [], say: "Looks right." }) };
    if (input === "/api/locate") return { ok: true, json: async () => ({ callout: null, placed: null }) };
    throw new Error(`Unexpected fetch: ${input}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function readyAt(instruction = "Build first piece.") {
  render(<BuildView />);
  await screen.findByRole("heading", { name: instruction });
  await waitFor(() => expect(mocks.saveManual).toHaveBeenCalledWith(expect.objectContaining({ page: manual.page })));
}

describe("BuildView step browser", () => {
  it("previews without changing active progress, speech, or checks", async () => {
    await readyAt();
    mocks.saveManual.mockClear();
    mocks.speak.mockClear();
    (fetch as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Browse steps" }));
    fireEvent.click(screen.getByRole("button", { name: /Step 2 · Page 5/ }));
    await screen.findByRole("heading", { name: "Attach second piece." });
    fireEvent.click(screen.getByRole("button", { name: /Step 2 · Page 7/ }));
    await screen.findByRole("heading", { name: "Add the third piece." });
    expect(screen.getByRole("heading", { name: "Build first piece." })).toBeTruthy();
    expect(mocks.saveManual).not.toHaveBeenCalled();
    expect(mocks.speak).not.toHaveBeenCalled();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(([input]) => input === "/api/check")).toBe(false);
  });

  it("keeps only the newest preview when an older page resolves late", async () => {
    const slow = deferred<null>();
    mocks.getPageSteps.mockImplementation((_id: string, page: number) => page === 7 ? slow.promise : Promise.resolve(null));
    await readyAt();
    fireEvent.click(screen.getByRole("button", { name: "Browse steps" }));
    fireEvent.click(screen.getByRole("button", { name: /Step 3 · Page 7/ }));
    fireEvent.click(screen.getByRole("button", { name: /Step 2 · Page 5/ }));
    await screen.findByRole("heading", { name: "Attach second piece." });
    await act(async () => { slow.resolve(null); await slow.promise; });
    expect(screen.getByRole("heading", { name: "Attach second piece." })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Add the cap." })).toBeNull();
  });

  it("switches to the exact index on another page and persists it", async () => {
    await readyAt();
    fireEvent.click(screen.getByRole("button", { name: "Browse steps" }));
    fireEvent.click(screen.getByRole("button", { name: /Step 3 · Page 7/ }));
    await screen.findByRole("heading", { name: "Add the cap." });
    fireEvent.click(screen.getByRole("button", { name: "Switch to this step" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Add the cap." })).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(mocks.saveManual).toHaveBeenCalledWith(expect.objectContaining({ page: 7, stepIdx: 1 })));
  });

  it("switches on the same page without reloading it and clears the check result", async () => {
    await readyAt();
    const readsBefore = mocks.getPageSteps.mock.calls.filter(([, page]) => page === 5).length;
    fireEvent.click(screen.getByRole("button", { name: "Check build" }));
    await screen.findByText("Looks right.");
    fireEvent.click(screen.getByRole("button", { name: "Browse steps" }));
    fireEvent.click(screen.getByRole("button", { name: /Step 2 · Page 5/ }));
    await screen.findByRole("heading", { name: "Attach second piece." });
    fireEvent.click(screen.getByRole("button", { name: "Switch to this step" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Attach second piece." })).toBeTruthy());
    expect(screen.queryByText("Looks right.")).toBeNull();
    expect(mocks.getPageSteps.mock.calls.filter(([, page]) => page === 5).length).toBe(readsBefore);
  });

  it("keeps direct step navigation working", async () => {
    await readyAt();
    fireEvent.click(screen.getAllByRole("button", { name: "Go to step 2" })[0]);
    await screen.findByRole("heading", { name: "Attach second piece." });
    fireEvent.click(screen.getByRole("button", { name: "Go to step 1" }));
    await screen.findByRole("heading", { name: "Build first piece." });
  });

  it("restores an exact saved step and defaults legacy manuals to index zero", async () => {
    mocks.getManual.mockResolvedValueOnce({ ...manual, page: 7, stepIdx: 1 });
    render(<BuildView />);
    await screen.findByRole("heading", { name: "Add the cap." });
    cleanup();
    mocks.getManual.mockResolvedValueOnce({ ...manual, page: 5 });
    render(<BuildView />);
    await screen.findByRole("heading", { name: "Build first piece." });
  });

  it("cancels a passed check's timer and keyboard navigation while the browser is open", async () => {
    await readyAt();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Check build" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText("Looks right.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Browse steps" }));
    const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "Enter" });
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole("heading", { level: 1, name: "Build first piece." })).toBeTruthy();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows an empty uploaded page and an extraction failure without moving the active step", async () => {
    const blocked = deferred<null>();
    mocks.loadPrebuilt.mockResolvedValue(null);
    mocks.getManual.mockResolvedValue({ ...manual, source: "upload", pdfPath: undefined, page: 1 });
    mocks.getPageSteps.mockImplementation((_id: string, page: number) => page === 1 ? Promise.resolve(page5) : page === 2 ? Promise.resolve([]) : blocked.promise);
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/extract") return { ok: false, json: async () => ({ error: "Extract failed" }) };
      throw new Error(`Unexpected fetch: ${input}`);
    }));
    render(<BuildView />);
    await screen.findByRole("heading", { name: "Build first piece." });
    fireEvent.click(screen.getByRole("button", { name: "Browse steps" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Manual page" }), { target: { value: "2" } });
    await screen.findAllByText("No assembly steps on this page.");
    fireEvent.change(screen.getByRole("combobox", { name: "Manual page" }), { target: { value: "3" } });
    await act(async () => { blocked.resolve(null); await blocked.promise; });
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Extract failed");
    expect(screen.getByRole("heading", { name: "Build first piece." })).toBeTruthy();
  });
});
