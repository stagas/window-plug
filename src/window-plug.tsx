/** @jsxImportSource mixter/jsx */
import { AnimSettings, createStepAnimation, StepAnimation } from 'animatrix'
import { FastHTMLElement } from 'fast-html-element'
import { Morph, Point, Polygon, Rect } from 'geometrik'
import { chain, dataset, dispatch, EventHandler, events, mixter, on, props, shadow, state } from 'mixter'
import { jsx, refs } from 'mixter/jsx'
import { pick } from 'pick-omit'
import { Cable, Plug, PlugKind } from 'plugs-and-cables'
import { roundCorners } from 'svg-round-corners'
import { SurfaceElement, WorkspaceWindowElement } from 'x-workspace'
import type { Arrow, WindowPlugSolveOptions } from './types'
import { createWindowPlugWorker } from './window-plug-core'

export type WindowPlugEvents = {
  statechange: CustomEvent
  connectstart: CustomEvent
  connectmove: CustomEvent
  connectend: CustomEvent
}

export type WindowPlugArrowEvents = {
  change: CustomEvent
}

export class WindowPlugContext {
  listeners: any[] = []
}

export class WindowPlugArrowElement extends mixter(
  HTMLElement,
  shadow(),
  events<WindowPlugArrowElement, WindowPlugEvents>(),
  props(
    class {
      color = '#66a'
      step?: number
      rect?: Rect
      points?: Point[]
      atRest = true

      svg?: SVGSVGElement
      svgPath?: SVGPathElement

      offset?: Point
      path?: string
      animPath?: string

      getSaSb?: () => readonly [Point, Point]

      anim?: StepAnimation<{ rect: Rect; points: Point[] }>
      animValues?: { rect: Rect; points: Point[] }
      animSettings: Record<string, AnimSettings> = {
        rest: {
          duration: 600,
          easing: [0.32, 0, 0.15, 1], // Easing.Linear,
        },
        quick: {
          duration: 200,
          easing: [0.32, 0, 0.8, 1], // Easing.Linear,
        },
      }
    }
  ),
  state<WindowPlugArrowElement>(({ $, effect, reduce }) => {
    const { render } = jsx($)
    const { ref } = refs($)

    effect(({ host, rect }) => {
      dataset(host, rect.toJSON())
      dispatch.composed.bubbles(host, 'change')
    })

    effect(({ host }) => {
      host.style.pointerEvents = 'none'
    })

    $.offset = reduce(({ rect }) => rect.pos.negate())

    $.anim = reduce(({ animSettings, atRest }) => createStepAnimation(animSettings[atRest ? 'rest' : 'quick'], $.anim))

    $.animValues = reduce(({ anim: { set }, points, rect }) =>
      set({
        rect,
        points: points.map(x => x.translate(rect.pos.negate())),
      })
    )

    $.animValues = reduce.raf.desync(({ anim: { t, from, to, update }, animValues: _ }) => {
      // const flen = from.points.length
      // const tlen = to.points.length
      // const coeff = flen / tlen
      return update({
        rect: from.rect.interpolate(to.rect, t),
        points: Polygon.morph(Morph.Nearest, from.points, to.points, t),
        // to.points.map((x, i) => {
        //   const fp = from.points[i * coeff | 0]
        //   if (fp) return fp.interpolate(x, t)
        //   else return x
        // }),
      })
    })

    effect.raf.desync(({ host, animValues, getSaSb, rect, step }) => {
      const [sa, sb] = getSaSb().map(x => x.sub(rect.pos))
      let points = [sb, ...animValues.points.slice(1, -1), sa]
      // points = Polygon.rope(points, 0.18)
      // points = Polygon.chop(points, 50, 100)
      $.animPath = roundCorners(
        Polygon.toSVGPath(points),
        step * 10
      ).path
      Object.assign(host.style, animValues.rect.toStyle())
    })
    // effect(({ rect, points, step }) => {
    //   try {
    //     const rn = rect.pos.negate()

    //     const nextPath = roundCorners(Point.toSVGPath(points.map(x => x.translate(rn))), step).path

    //     if (!$.animPath) {
    //       $.animPath = nextPath
    //     } else {
    //       const from = $.animPath
    //       const to = nextPath

    //       tweenPaths({
    //         duration: 1000,
    //         from,
    //         to,
    //         next: (d: string) => {
    //           $.animPath = d // path.setAttribute('d', d)
    //         },
    //       })

    //       // tweenSvgPath(from, to, 1000).onUpdate(newPath => {
    //       //   $.animPath = newPath
    //       // })
    //     }
    //   } catch {}
    // })

    $.path = reduce(({ animPath: path }) => {
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
      // const path = roundCorners(animPath, step).path

      if (path.includes('NaN')) {
        return $.path
      }

      return path
    })

    effect(({ rect, svg }) => {
      svg.setAttribute('width', '' + rect.width)
      svg.setAttribute('height', '' + rect.height)
    })

    effect(({ path, svgPath }) => {
      svgPath.setAttribute('d', path)
    })

    render.once(({ color, path, rect }) => (
      <>
        <style>
          {/*css*/ `
          :host {
            display: inline-flex;
            contain: size layout style paint;
            /* transition: all 90ms linear; */
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
        <svg ref={ref.svg} width={rect.width} height={rect.height}>
          <path
            ref={ref.svgPath}
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
  worker = createWindowPlugWorker()
  cache = new Map()
  options!: WindowPlugSolveOptions
  ids = new Map()

  constructor(public surface: SurfaceElement) {
    super()
  }

  async updateOptions(options: WindowPlugSolveOptions) {
    this.options = options
    await this.worker.updateOptions(options)
  }

  async updateData() {
    const viewRect = this.surface.viewRect!.clone()
    const viewFrameRect = this.surface.viewFrameRect!.transform(this.surface.viewMatrix.inverse())
    const rects = [...this.plugs.keys()].map(x => Rect.fromElement(x.target!))
    await this.worker.updateData({ viewRect, viewFrameRect, rects })
  }

  async clearAndSolve() {
    this.cache.clear()
    await this.updateData()
    return await this.solve()
  }

  async solve() {
    const { ids } = this

    console.time('solve')
    // console.time('start')
    this.worker.start()
    // console.timeEnd('start')

    const arrows: Arrow[] = []
    const visited = new Set<Cable>()

    const outsMap = new Map()
    const insMap = new Map()

    if (!this.holding)
      for (const plugEl of this.plugs.keys()) {
        for (const [cable, plug] of plugEl.plug!.cables.entries()) {
          if (plug.plugKind !== Plug.Input) continue
          if (visited.has(cable)) continue
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

          outs.push(b)
          ins.push(a)

          const getSaSb = ((outsCount: number, insCount: number) =>
            () => {
              a.updateRect()
              b.updateRect()

              // bounds = Rect.combine([a.rect, b.rect]).zoomLinear(step * 8)

              const sa = new Point(
                a.rect.right,
                a.rect.y + outsCount * 50 - 25
              )

              const sb = new Point(
                b.rect.left,
                b.rect.y + insCount * 50 - 25
              )

              return [sa, sb] as const
            })(outs.length, ins.length)

          // const pa = sa.translate(outs.length * step / 3, 0) // .gridRound(step)
          // const pb = sb.translate(-ins.length * step / 3, 0) // .gridRound(step)

          // console.time('arrow')
          // const key = [sa, sb].join('')
          // let arrow
          // if (this.cache.has(key)) {
          //   arrow = this.cache.get(key)
          //   this.worker.pushArrow(arrow)
          // } else {
          const arrow = await this.worker.getArrow(...getSaSb())
          // this.cache.set(key, arrow)
          // }
          // console.timeEnd('arrow')
          // console.log('GOT ARROW', arrow)
          let id
          if (ids.has(cable)) {
            id = ids.get(cable)
          } else {
            id = (Math.random() * 10e7 | 0).toString(36)
            ids.set(cable, id)
          }
          arrow.id = id
          arrow.getSaSb = getSaSb
          arrow.targets = [a, b]
          arrows.push(arrow)
        }
      }

    if (this.holding) {
      const points = [this.holding.plug.rect.center, this.holding.target] as const
      const arrow = {
        id: 'holding',
        step: this.options.step,
        rect: Rect.fromUnsortedPoints(...points),
        getSaSb: () => points,
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
