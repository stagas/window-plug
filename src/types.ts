import type { Rect } from 'geometrik'

export interface WindowPlugSolveOptions {
  step: number
  separation: number
  distance: number
  heuristic: number
}

export interface WindowPlugSolveData {
  viewRect: Rect
  destRects: Rect[]
}
