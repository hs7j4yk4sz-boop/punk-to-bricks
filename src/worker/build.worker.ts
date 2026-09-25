// Runs detection and model building off the main thread.
import { buildModel, type Model, type SizeId } from '../core/build';
import { detectPunk, DetectError, type PunkGrid, type RGBAImage } from '../core/detect';

export type BuildRequest = { id: number; size: SizeId; image?: RGBAImage; grid?: PunkGrid; preferLego?: boolean };
export type BuildReply =
  | { id: number; ok: true; grid: PunkGrid; model: Model; ms: number }
  | { id: number; ok: false; code: string; message: string };

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const { id, size, image } = e.data;
  const t = performance.now();
  try {
    const grid = e.data.grid ?? detectPunk(image!);
    const model = buildModel(grid, size, { preferLego: !!e.data.preferLego });
    (self as unknown as Worker).postMessage({ id, ok: true, grid, model, ms: performance.now() - t } satisfies BuildReply);
  } catch (err) {
    const code = err instanceof DetectError ? err.code : 'error';
    const message = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ id, ok: false, code, message: code === 'error' ? `Something went wrong while building: ${message}` : message } satisfies BuildReply);
  }
};
