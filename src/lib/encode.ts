// Canvas to JPEG/PNG data URL without blocking the screen. toDataURL encodes on the main thread (the biggest cost
// while a book is read in the background on a phone); toBlob encodes off it, and FileReader turns the blob into the
// same data URL the rest of the app expects.
export function encodeCanvas(canvas: HTMLCanvasElement, type = "image/jpeg", quality?: number): Promise<string> {
  return new Promise((resolve) => {
    if (!canvas.toBlob) return resolve(canvas.toDataURL(type, quality));
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(canvas.toDataURL(type, quality));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(canvas.toDataURL(type, quality));
        reader.readAsDataURL(blob);
      },
      type,
      quality,
    );
  });
}
