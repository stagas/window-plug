import { Bob } from 'alice-bob'
import { findShortestPath, Heuristics, Strategy } from 'find-shortest-path'
import { Line, Point, Polygon, Rect } from 'geometrik'

import type { WindowPlugSolveData, WindowPlugSolveOptions } from './types'
import { agentOptions } from './window-plug-core'
import type { WindowPlugCore } from './window-plug-core'

export class WindowPlugWorker {
  options!: WindowPlugSolveOptions
  arrows = new Map<string, Polygon>()
  rects: Rect[] = []
  viewRect: Rect = new Rect()
  viewFrameRect: Rect = new Rect()
  step = 10
  strategies!: Strategy<Point>[]

  intersects(a: Point, b: Point) {
    const line = new Line(a, b)
    for (const rect of this.rects) {
      if (line.intersectsRect(rect)) return true
    }
    return false
  }

  async updateOptions(options: WindowPlugSolveOptions) {
    this.options = options
  }

  async updateData(data: WindowPlugSolveData) {
    const { step } = this.options

    // optimization: bound points in this rect
    this.viewRect = data.viewRect.zoomLinear(400)

    // give rectangles some margin from the points
    this.rects = data.destRects.map(x => x.zoomLinearSelf(this.options.step * 1.18))

    const acceptTolerance = 4 * step

    this.strategies = [
      {
        accept: (a, b) => !this.intersects(a, b) && a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Manhattan, 0.2],
        maxIterations: 80,
      },
      {
        accept: (a, b) => !this.intersects(a, b) && a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Chebyshev, 50],
        maxIterations: 80,
      },
      {
        accept: (a, b) => a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Chebyshev, 50],
        maxIterations: 300,
      },
    ]
  }

  async start() {
    this.arrows.clear()
  }

  hash = (p: Point) => {
    // TODO: try different hash step / 2 etc
    return p.gridRound(this.step).toString()
  }

  async getArrowPolygon(
    id: string,
    outPoint: Point,
    startPoint: Point,
    goalPoint: Point,
    inPoint: Point,
  ): Promise<Polygon> {
    const { viewRect, strategies } = this
    const { step, separation } = this.options
    const halfStep = step * 0.5

    const arrows = [...this.arrows.values()]

    let points: Point[] = []

    if (outPoint.distance(inPoint) > 150) {
      points = findShortestPath({
        start: startPoint,
        goal: goalPoint,
        hash: this.hash,
        strategies,
        neighbors: p => {
          // TODO: prefer first those neighbors that are in the same direction as last.p->p
          //   this better lives in find-shortest-path

          const neighbors: Point[] = []
          // out:
          for (const s of [step, halfStep]) {
            for (const x of [1, -1, 0]) {
              next:
              for (const y of [1, -1, 0]) {
                // if (neighbors.length === 6) break out

                const n = p.translate(x * s, y * s)
                if (n.withinRect(viewRect)) {
                  for (const arrow of arrows) {
                    for (const a of arrow.points) {
                      const dist = n.manhattan(a)
                      if (dist <= step * separation) {
                        continue next
                      }
                    }
                  }
                  if (!this.intersects(p, n)) {
                    neighbors.push(n)
                  }
                }
              }
            }
          }
          return neighbors
        },
      })
    }

    points = [
      outPoint,
      startPoint,
      ...points.slice(1, -1),
      goalPoint,
      inPoint,
    ]

    const arrow = new Polygon(points)

    this.arrows.set(id, arrow)

    return arrow
  }
}

setTimeout(() => {
  const plugWorker = new WindowPlugWorker()

  const [worker] = new Bob<WindowPlugWorker, WindowPlugCore>(
    data => void self.postMessage(data),
    plugWorker
  ).agents(agentOptions)

  self.onmessage = ({ data }) => worker.receive(data)
})
