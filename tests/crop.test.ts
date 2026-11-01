import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampCrop } from '../src/components/crop.ts'

// The cropped square never leaves the photo and zoom stays between 1x and 4x.
test('photo crop stays inside the picture', () => {
  assert.deepEqual(clampCrop({ cx: 600, cy: 400, zoom: 1 }, 1200, 800), { cx: 600, cy: 400, zoom: 1 })
  assert.deepEqual(clampCrop({ cx: -50, cy: 9999, zoom: 1 }, 1200, 800), { cx: 400, cy: 400, zoom: 1 }, 'dragged too far: pulled back inside')
  assert.deepEqual(clampCrop({ cx: 0, cy: 0, zoom: 2 }, 1200, 800), { cx: 200, cy: 200, zoom: 2 })
  assert.equal(clampCrop({ cx: 600, cy: 400, zoom: 9 }, 1200, 800).zoom, 4)
  assert.equal(clampCrop({ cx: 600, cy: 400, zoom: 0.2 }, 1200, 800).zoom, 1)
  assert.equal(clampCrop({ cx: 600, cy: 400, zoom: Number.NaN }, 1200, 800).zoom, 1)
})
