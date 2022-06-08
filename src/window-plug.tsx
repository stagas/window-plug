/** @jsxImportSource mixter/jsx */
// import { chunk } from 'everyday-utils'
import { FastHTMLElement } from 'fast-html-element'
import { findShortestPath, Heuristics, Strategy } from 'find-shortest-path'
import { Line, Point, Rect } from 'geometrik'
import { chain, dataset, dispatch, EventHandler, events, mixter, on, props, shadow, state } from 'mixter'
import { jsx } from 'mixter/jsx'
import { pick } from 'pick-omit'
import { Cable, Plug, PlugKind } from 'plugs-and-cables'
// import * as ShapePoints from 'shape-points'
import { roundCorners } from 'svg-round-corners'
import { SurfaceElement, WorkspaceWindowElement } from 'x-workspace'

export type WindowPlugEvents = {
  statechange: CustomEvent
  connectstart: CustomEvent
  connectmove: CustomEvent
  connectend: CustomEvent
}

export class WindowPlugContext {
  listeners: any[] = []
}

export class WindowPlugArrowElement extends mixter(
  HTMLElement,
  shadow(),
  props(
    class {
      color = '#66a'
      step?: number
      rect?: Rect
      points?: Point[]
      path?: string
    }
  ),
  state<WindowPlugArrowElement>(({ $, effect, reduce }) => {
    const { render } = jsx($)

    effect(({ host, rect }) => dataset(host, rect.toJSON()))

    effect(({ host }) => {
      host.style.pointerEvents = 'none'
    })

    $.path = reduce(({ rect, points, step }) => {
      const rn = rect.pos.negate()
      // return Point.toSVGPath(
      //   chunk(
      //     ShapePoints.bezierCurveThrough(
      //       ...points.map(x => [...x.translate(rn)]).flat(),
      //       {
      //         curveError: step * 4,
      //       }
      //     ) as number[],
      //     2
      //   ).map(([x, y]) => new Point(x, y))
      // )
      return roundCorners(
        Point.toSVGPath(
          points.map(x => x.translate(rn))
        ),
        step * 4
      ).path
    })

    render(({ color, path, rect }) => (
      <>
        <style>
          {/*css*/ `
          :host {
            display: inline-flex;
            contain: size layout style paint;
            z-index: 0;
          }
          svg {
            /* shape-rendering: optimizeSpeed; */
          }
          path {
            stroke: ${color};
          }
          path:hover {
            stroke: #fff;
          }
        `}
        </style>
        <svg width={rect.width} height={rect.height}>
          <path
            stroke-width={7.5}
            pointer-events="painted"
            fill="none"
            d={path}
          />
        </svg>
      </>
    ))
  })
) {}

export interface Arrow {
  step: number
  rect: Rect
  points: Point[]
}

export class WindowPlugScene extends EventTarget {
  arrows?: Arrow[]
  plugs = new Map<WindowPlugElement, WindowPlugContext>()
  plugsMap = new Map<Plug, WindowPlugElement>()
  enabled: WindowPlugElement[] = []
  hovering: WindowPlugElement | null = null
  holding?: { plug: WindowPlugElement; target: Point } | null
  endPointerMove?: () => void
  onchange?: EventHandler<WindowPlugScene, CustomEvent>
  onhover?: EventHandler<WindowPlugScene, CustomEvent<WindowPlugElement>>

  constructor(public surface: SurfaceElement) {
    super()
  }

  solve(options: { step: number; separation: number; distance: number; heuristic: number }) {
    console.time('solve')

    const { step } = options

    const halfStep = step * 0.5

    // let bounds: Rect

    const zoomedView = this.surface.viewRect!.zoomLinear(400)

    const rects = [...this.plugs.keys()]
      .map(x => Rect.fromElement(x.target!).zoomLinear(step * 1.18))

    const arrows: Arrow[] = []
    const visited = new Set<Cable>()

    const outsMap = new Map()
    const insMap = new Map()

    const intersects = (a: Point, b: Point) => {
      const line = new Line(a, b)
      for (const rect of rects) {
        if (line.intersectsRect(rect)) return true
      }
      return false
    }

    const acceptTolerance = 5 * step

    const strategies: Strategy<Point>[] = [
      {
        accept: (a, b) => !intersects(a, b) && a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Manhattan, 0.2],
        maxIterations: 20,
      },
      {
        accept: (a, b) => !intersects(a, b) && a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Chebyshev, 50],
        maxIterations: 20,
      },
      {
        accept: (a, b) => a.manhattan(b) <= acceptTolerance,
        distance: [Heuristics.Manhattan, 0.25],
        heuristic: [Heuristics.Chebyshev, 50],
        maxIterations: 50,
      },
    ]

    const getArrow = (sa: Point, sb: Point) => {
      const pa = sa.translate(halfStep, 0)
      const pb = sb.translate(-halfStep, 0)

      let points: Point[] = []

      if (sa.distance(sb) > 150) {
        points = findShortestPath({
          start: pa,
          goal: pb,
          hash: p => p.gridRound(step).toString(),
          strategies,
          neighbors(p) {
            return [
              // TODO: we can try the shortest directions first
              p.translate(+step, +step),
              p.translate(+step, -step),
              p.translate(-step, +step),
              p.translate(-step, -step),

              p.translate(+step, 0),
              p.translate(0, +step),
              p.translate(-step, 0),
              p.translate(0, -step),
              //
              p.translate(+halfStep, +halfStep),
              p.translate(+halfStep, -halfStep),
              p.translate(-halfStep, +halfStep),
              p.translate(-halfStep, -halfStep),

              p.translate(+halfStep, 0),
              p.translate(0, +halfStep),
              p.translate(-halfStep, 0),
              p.translate(0, -halfStep),
            ]
              .filter(p => p.withinRect(zoomedView!))
              .filter(n => {
                // if (n.manhattan(pb) > step * 40)
                for (const arrow of arrows) {
                  for (const a of arrow.points) {
                    if (n.manhattan(a) <= step * options.separation) return false
                  }
                }

                return !intersects(p, n)
              })
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

      const rect = new Rect(
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y
      ).zoomLinearSelf(150)

      const arrow = {
        step,
        rect,
        points,
      }

      return arrow
    }

    if (!this.holding)
      for (const plugEl of this.plugs.keys()) {
        plugEl.plug!.cables.forEach((plug, cable) => {
          if (plug.plugKind !== Plug.Input) return
          if (visited.has(cable)) return
          visited.add(cable)

          const otherEl = this.plugsMap.get(plug)!

          const a = plugEl
          const b = otherEl

          let outs
          let ins

          if (!outsMap.has(a)) {
            outs = [] as HTMLDivElement[]
            outsMap.set(a, outs)
          } else {
            outs = outsMap.get(a)!
          }

          if (!insMap.has(b)) {
            ins = [] as HTMLDivElement[]
            insMap.set(b, ins)
          } else {
            ins = insMap.get(b)!
          }

          a.updateRect()
          b.updateRect()

          // bounds = Rect.combine([a.rect, b.rect]).zoomLinear(step * 8)

          outs.push(b)
          ins.push(a)

          const sa = new Point(
            a.rect.right,
            a.rect.y + outs.length * 50 - 25
          )

          const sb = new Point(
            b.rect.left,
            b.rect.y + ins.length * 50 - 25
          )

          // const pa = sa.translate(outs.length * step / 3, 0) // .gridRound(step)
          // const pb = sb.translate(-ins.length * step / 3, 0) // .gridRound(step)

          const arrow = getArrow(sa, sb)

          arrows.push(arrow)
        })
      }

    if (this.holding) {
      const points = [this.holding.plug.rect.center, this.holding.target] as const
      const arrow = {
        step: options.step,
        rect: Rect.fromUnsortedPoints(...points),
        points: points as any,
      }
      arrows.push(...this.arrows!, arrow)
    } else {
      this.arrows = arrows
    }
    //   const { plug: a, target: sb } = this.holding

    //   const sa = new Point(
    //     a.rect.right,
    //     a.rect.y + (a.plug!.cables.size + 1) * 50 - 25
    //   )

    //   if (a.plug!.plugKind === PlugKind.Input) {
    //     const arrow = getArrow(sb, sa)
    //     arrows.push(arrow)
    //   } else {
    //     const arrow = getArrow(sa, sb)
    //     arrows.push(arrow)
    //   }
    // }

    console.timeEnd('solve')

    return arrows
  }

  startConnecting(plugEl: WindowPlugElement) {
    this.enabled = []

    const thisPlug = plugEl.plug!

    plugEl.classList.add('active')

    for (const other of this.plugs.keys()) {
      const otherPlug = other.plug!

      if (
        otherPlug !== thisPlug
        && (
          (
            otherPlug.cableKind !== thisPlug.cableKind
            || otherPlug.plugKind === thisPlug.plugKind
          )
          || other.target === plugEl.target
        )
      ) {
        other.classList.add('disabled')
      } else if (otherPlug !== thisPlug) {
        other.classList.add('enabled')
        this.enabled.push(other)
      }
    }

    this.endPointerMove = on(window).pointermove(e => {
      const p = new Point(e.pageX, e.pageY)

      const previous = this.hovering
      this.hovering = null

      for (const plugEl of this.enabled) {
        const pos = p.normalize(plugEl.target!.surface!.matrix)
        if (
          pos.withinRect(plugEl.target!.rect!)
          || pos.withinRect(plugEl.rect!)
        ) {
          this.hovering = plugEl
          if (previous !== this.hovering) {
            this.onhover?.(
              new CustomEvent('hover', { detail: plugEl }) as any
            )
          }
        }
      }
    })
  }

  endConnecting(plugEl: WindowPlugElement) {
    if (this.hovering) {
      const plug = plugEl.plug!

      let input: Plug<PlugKind.Input>
      let output: Plug<PlugKind.Output>

      if (plug.plugKind === Plug.Output) {
        output = plug
        input = this.hovering.plug!
      } else {
        output = this.hovering.plug!
        input = plug
      }

      output.connect(input)

      dispatch.composed.bubbles(plugEl, 'statechange')
      dispatch.composed.bubbles(this.hovering, 'statechange')

      console.log('connected', output, input)
    }

    for (const plugEl of this.plugs.keys()) {
      plugEl.classList.remove('disabled')
      plugEl.classList.remove('active')
      plugEl.classList.remove('enabled')
    }

    this.endPointerMove?.()
  }

  add(this: WindowPlugScene, plugElement: WindowPlugElement) {
    const context = new WindowPlugContext()
    this.plugs.set(plugElement, context)
    this.plugsMap.set(plugElement.plug!, plugElement)

    context.listeners.push(
      chain(
        on(plugElement).connectstart(() => {
          this.startConnecting(plugElement)
        }),
        on(plugElement).connectend(() => {
          this.endConnecting(plugElement)
        })
      )
    )

    dispatch(this, 'change')
  }

  remove(this: WindowPlugScene, plugElement: WindowPlugElement) {
    const context = this.plugs.get(plugElement)!
    context.listeners.forEach(fn => fn())
    this.plugs.delete(plugElement)
    dispatch(this, 'change')
  }
}

export class WindowPlugElement extends mixter(
  FastHTMLElement,
  events<WindowPlugElement, WindowPlugEvents>(),
  shadow(),
  props(
    class {
      target?: WorkspaceWindowElement
      scene?: WindowPlugScene
      plug?: Plug<any, any>
      channel = 0
    }
  ),
  state<WindowPlugElement>(({ $, effect }) => {
    const { render } = jsx($)

    effect(({ host, scene }) => {
      scene.add(host)
      return () => scene.remove(host)
    })

    effect(({ host, plug }) => {
      host.title = `${plug.cableKind} ${plug.plugKind}`

      dataset(host, pick(plug, ['cableKind', 'plugKind']))
    })

    effect(({ host, scene, target }) =>
      on(host).pointerdown.stop(e => {
        let p = new Point(e.pageX, e.pageY)
          .normalize(target.surface!.matrix)
        scene.holding = { plug: host, target: p }

        dispatch.composed.bubbles(host, 'connectstart')

        const clear = () => {
          scene.holding = null
          removeListeners()
          dispatch.composed.bubbles(host, 'connectend')
          console.log('ended')
        }
        console.log('started')

        const onPointerMove = on(window).pointermove.stop(e => {
          p = new Point(e.pageX, e.pageY)
            .normalize(target.surface!.matrix)
          scene.holding = { plug: host, target: p }
          dispatch.composed.bubbles(host, 'connectmove')
        })
        const offPointerUp = on(window).pointerup.stop.prevent(clear)
        const offPointerCancel = on(window).pointercancel.stop.prevent(clear)
        const removeListeners = chain(onPointerMove, offPointerUp, offPointerCancel)
      })
    )

    render(({ plug }) => (
      <>
        <style>
          {/*css*/ `
          :host {
            box-sizing: border-box;
            contain: size layout style paint;
            position: relative;
            height: ${(plug.cables.size + 1) * 50}px;
          }
          [part=back],
          [part=plug] {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
          }
        `}
        </style>
        <div part="back"></div>
        <div part="plug"></div>
      </>
    ))
  })
) {}
