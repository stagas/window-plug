import { Bob } from 'alice-bob'
import { findShortestPath, Heuristics, Strategy } from 'find-shortest-path'
import { Line, Point, Rect } from 'geometrik'
import type { Arrow, WindowPlugSolveData, WindowPlugSolveOptions } from './types'
import { receive, send } from './window-plug-core'
import type { WindowPlugCore } from './window-plug-core'

export class WindowPlugWorker {
  options!: WindowPlugSolveOptions
  arrows: Arrow[] = []
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
    this.viewRect = data.viewRect.zoomLinear(200)
    this.viewFrameRect = data.viewFrameRect
    this.rects = data.rects.map(x => x.zoomLinearSelf(this.options.step * 1.18))
    const acceptTolerance = 5 * step

    this.strategies = [
      {
        accept: (a, b) => !this.intersects(a, b) && a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Manhattan, 0.2],
        maxIterations: 20,
      },
      {
        accept: (a, b) => !this.intersects(a, b) && a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Chebyshev, 50],
        maxIterations: 20,
      },
      {
        accept: (a, b) => a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Chebyshev, 50],
        maxIterations: 130,
      },
    ]
  }

  async start() {
    this.arrows = []
  }

  hash = (p: Point) => {
    return p.gridRound(this.step).toString()
  }

  // async pushArrow(arrow: Arrow) {
  //   this.arrows.push(arrow)
  // }

  async getArrow(sa: Point, sb: Point): Promise<Arrow> {
    const { viewRect, viewFrameRect, strategies } = this
    const { step, separation } = this.options
    const halfStep = step * 0.5
    // const doubleStep = step * 1.5

    const pa = sa.translate(halfStep, 0)
    const pb = sb.translate(-halfStep, 0)

    let points: Point[] = []

    if (sa.distance(sb) > 150) {
      points = findShortestPath({
        start: pa,
        goal: pb,
        hash: this.hash,
        strategies,
        neighbors: p => {
          const neighbors: Point[] = []
          out:
          for (const s of [step, halfStep]) {
            for (const x of [1, -1, 0]) {
              next:
              for (const y of [1, -1, 0]) {
                if (neighbors.length === 6) break out

                const n = p.translate(x * s, y * s)
                if (n.withinRect(viewRect)) {
                  for (const arrow of this.arrows) {
                    for (const a of arrow.points) {
                      if (n.manhattan(a) <= step * separation) continue next
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

    points = [sb, ...points, sa]

    const topLeft = new Point(Infinity, Infinity)
    const bottomRight = new Point(-Infinity, -Infinity)

    for (const p of points) {
      if (p.x < topLeft.x) topLeft.x = p.x
      if (p.x > bottomRight.x) bottomRight.x = p.x
      if (p.y < topLeft.y) topLeft.y = p.y
      if (p.y > bottomRight.y) bottomRight.y = p.y
    }

    // const rect = new Rect(
    //   topLeft.x,
    //   topLeft.y,
    //   bottomRight.x - topLeft.x,
    //   bottomRight.y - topLeft.y
    // ).zoomLinearSelf(250)

    const arrow: Arrow = {
      step,
      rect: viewFrameRect,
      points,
    }

    this.arrows.push(arrow)

    return arrow
  }
}

const plugWorker = new WindowPlugWorker()

const [worker] = new Bob<WindowPlugWorker, WindowPlugCore>(
  data => void self.postMessage(send(data)),
  plugWorker
).agents({ debug: false })

self.onmessage = ({ data }) => worker.receive(receive(data))
