import type { Point, Rect } from 'geometrik'
import type { WindowPlugElement } from './window-plug'

export interface WindowPlugSolveOptions {
  step: number
  separation: number
  distance: number
  heuristic: number
}

export interface WindowPlugSolveData {
  viewRect: Rect
  viewFrameRect: Rect
  rects: Rect[]
}

export interface Arrow {
  id?: string
  getSaSb?: () => readonly [Point, Point]
  targets?: readonly [WindowPlugElement, WindowPlugElement]
  step: number
  rect: Rect
  points: Point[]
}
