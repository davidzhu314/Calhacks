import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ExtractedStep } from "@/app/api/extract/route";
import StepBrowser from "./StepBrowser";

const step: ExtractedStep = {
  number: 2, instruction: "Attach the blue plate.", parts: [{ name: "blue plate", color: "#369ddd", qty: 1, shape: "plate" }],
  watchFor: [], box: { x: 0, y: 0, w: 1, h: 1 },
};

function props() {
  return {
    active: { page: 5, stepIdx: 0 }, activeNumber: 1,
    previewLocation: { page: 7, stepIdx: 1 }, previewStep: step, previewImage: "data:image/jpeg;base64,preview",
    list: [
      { page: 5, stepIdx: 0, number: 1, instruction: "Start the base." },
      { page: 7, stepIdx: 1, number: 2, instruction: "Attach the blue plate." },
    ],
    pageCount: 7, isPrebuilt: true, loading: false, error: null,
    previousLocation: { page: 5, stepIdx: 0 }, nextLocation: null,
    triggerRef: { current: null }, onInspect: vi.fn(), onClose: vi.fn(), onSwitch: vi.fn(),
  };
}

afterEach(cleanup);

describe("StepBrowser", () => {
  it("marks active and preview locations separately and shows the real step details", () => {
    const values = props();
    render(<StepBrowser {...values} />);
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText(/Active build: Step 1 · Previewing Step 2/)).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByAltText("Manual picture for step 2 on page 7")).toBeTruthy();
    expect(screen.getByText("blue plate")).toBeTruthy();
    fireEvent.click(screen.getByText("Start the base."));
    expect(values.onInspect).toHaveBeenCalledWith({ page: 5, stepIdx: 0 });
    expect(values.onSwitch).not.toHaveBeenCalled();
  });

  it("renders empty and error states without offering a switch", () => {
    const values = props();
    const { rerender } = render(<StepBrowser {...values} isPrebuilt={false} list={[]} previewStep={null} previewImage={null} />);
    expect(screen.getAllByText("No assembly steps on this page.").length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Switch to this step" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<StepBrowser {...values} isPrebuilt={false} list={[]} previewStep={null} previewImage={null} error="Extract failed" />);
    expect(screen.getByRole("alert").textContent).toContain("Extract failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(values.onInspect).toHaveBeenCalledWith(values.previewLocation);
  });

  it("puts focus into the dialog and returns it to its trigger", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const values = props();
    const { unmount } = render(<StepBrowser {...values} triggerRef={{ current: trigger }} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close step browser" }));
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
