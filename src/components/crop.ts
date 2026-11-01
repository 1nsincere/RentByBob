// Crop position in the photo's own pixels: the centre of the square and how far it is zoomed in (1 = whole short side).
// The square always stays inside the photo, whatever the drag or zoom.
export const MAX_ZOOM = 4
export type Crop = { cx: number; cy: number; zoom: number }
export function clampCrop(crop: Crop, width: number, height: number): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Number.isFinite(crop.zoom) ? crop.zoom : 1))
  const half = Math.min(width, height) / zoom / 2
  return { zoom, cx: Math.min(width - half, Math.max(half, crop.cx)), cy: Math.min(height - half, Math.max(half, crop.cy)) }
}
