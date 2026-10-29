// Fixed positions from the owner's site sketch (percent of the plan area), shared by the real property map.
// Matches the preview layout the owner approved; buildings are placed by their saved sketch_slot.
export type SketchSlot = 'bob' | 'b1' | 'b2' | 'house' | 'yamaha' | 'store1' | 'store2' | 'store3'
export const sketchPositions: Record<SketchSlot, { x: number; y: number; w: number; h: number }> = {
  bob: { x: 26, y: 68, w: 25, h: 25 },
  b1: { x: 26, y: 32, w: 24, h: 24 },
  b2: { x: 52, y: 32, w: 24, h: 24 },
  house: { x: 78, y: 32, w: 20, h: 24 },
  yamaha: { x: 43, y: 3, w: 20, h: 25 },
  store3: { x: 15, y: 3, w: 8, h: 25 },
  store2: { x: 24, y: 3, w: 8, h: 25 },
  store1: { x: 33, y: 3, w: 8, h: 25 },
}
