/** @jsxImportSource sigl */
import $ from 'sigl'

import { ImmMap, ImmSet } from 'immutable-map-set'
import { Cable, Plug, PlugKind } from 'plugs-and-cables'
import { Point, Polygon, Rect } from 'sigl'
import {
  SurfaceElement,
  SurfaceMoveElement,
  SurfaceMoveEvents,
  SurfaceResizeElement,
  WorkspaceElement,
  WorkspaceWindowElement,
} from 'x-workspace'

import { PlugArrow } from './plug-arrow'
import type { WindowPlugSolveOptions } from './types'
import { WindowPlugElement } from './window-plug'
import { WindowPlugArrowElement } from './window-plug-arrow'
import { createWindowPlugWorker } from './window-plug-core'

export type WindowPlugSceneEvents = {
  hover: CustomEvent
}

export interface WindowPlugSceneElement extends $.Element<WindowPlugSceneElement, WindowPlugSceneEvents> {}

@$.element()
export class WindowPlugSceneElement extends HTMLElement {
  root = this

  WindowPlugArrow = $.element(WindowPlugArrowElement)
  PlugArrows: () => JSX.Element = () => null

  workspace?: WorkspaceElement
  surface?: SurfaceElement
  draggingWindow?: WorkspaceWindowElement | false = false

  worker = createWindowPlugWorker()
  options: WindowPlugSolveOptions = { step: 84, separation: 0.56, distance: 0.25, heuristic: 0.38 }
  viewRect?: Rect
  destRects?: Rect[]

  arrows = new ImmMap<Cable, PlugArrow>()
  plugs = new ImmSet<WindowPlugElement>()
  plugsMap = new ImmMap<Plug, WindowPlugElement>()

  solve?: () => Promise<void>
  addPlug?: (plugElement: WindowPlugElement) => void
  removePlug?: (plugElement: WindowPlugElement) => void

  startConnecting?: (plugElement: WindowPlugElement) => void
  endConnecting?: (plugElement: WindowPlugElement) => void
  endPointerMove?: () => void
  enabled: WindowPlugElement[] = []
  hovering: WindowPlugElement | null = null
  holding?: { plug: WindowPlugElement; cable: Cable; dest: Point } | false = false

  mounted($: WindowPlugSceneElement['$']) {
    $.effect(({ worker }) =>
      $.warn(() => {
        ;(worker as any).__worker.terminate()
      })
    )

    $.solve = $.reduce(({ worker }) =>
      $.queue.task.last.not.next(async () => {
        await worker.start()

        for (const arrow of $.arrows.values()) {
          await arrow.solve()
        }

        $.arrows = new ImmMap($.arrows)
      })
    )

    // TODO: on teardown remove all plugs context listeners
    $.addPlug = $.callback(({ host, plugs, plugsMap }) =>
      plugElement => {
        $.plugs = plugs.add(plugElement)
        $.plugsMap = plugsMap.set(plugElement.plug!, plugElement)
        $.dispatch(host, 'change')
      }
    )

    $.removePlug = $.callback(({ host, plugs, plugsMap }) =>
      plugElement => {
        $.plugs = plugs.delete(plugElement)
        $.plugsMap = plugsMap.delete(plugElement.plug!)
        $.dispatch(host, 'change')
      }
    )

    $.startConnecting = $.callback(({ host, plugs }) =>
      plugEl => {
        $.enabled = []

        const thisPlug = plugEl.plug!

        plugEl.classList.add('active')

        for (const other of plugs) {
          const otherPlug = other.plug!

          if (
            otherPlug !== thisPlug
            && (
              (
                otherPlug.cableKind !== thisPlug.cableKind
                || otherPlug.plugKind === thisPlug.plugKind
              )
              || other.dest === plugEl.dest
            )
          ) {
            other.classList.add('disabled')
          } else if (otherPlug !== thisPlug) {
            other.classList.add('enabled')
            $.enabled.push(other)
          }
        }

        $.endPointerMove = $.on(window).pointermove(e => {
          const p = new Point(e.pageX, e.pageY).sub(plugEl.dest!.surface!.rect.pos)

          const previous = $.hovering
          $.hovering = null

          for (const plugEl of $.enabled) {
            const pos = p.normalize(plugEl.dest!.surface!.matrix)
            if (
              pos.withinRect(plugEl.dest!.rect!)
              || pos.withinRect(plugEl.rect!)
            ) {
              $.hovering = plugEl
              plugEl.dest!.classList.add('connect-hover')
              if (previous !== $.hovering) {
                $.dispatch(host, 'hover', { detail: { plug: plugEl } })
              }
            } else {
              plugEl.dest!.classList.remove('connect-hover')
            }
          }
        })
      }
    )

    $.endConnecting = $.reduce(() =>
      $.callback(({ arrows, endPointerMove, plugs, holding, hovering }) =>
        plugEl => {
          endPointerMove?.()

          if (!holding) return
          $.holding = false

          if (hovering) {
            $.hovering = null

            hovering.dest!.classList.remove('connect-hover')

            const plug = plugEl.plug!

            let input: Plug<PlugKind.Input>
            let output: Plug<PlugKind.Output>

            let inEl: WindowPlugElement
            let outEl: WindowPlugElement

            if (plug.plugKind === Plug.Output) {
              output = plug
              input = hovering.plug!

              outEl = plugEl
              inEl = hovering
            } else {
              output = hovering.plug!
              input = plug

              outEl = hovering
              inEl = plugEl
            }

            const cable = holding.cable
            const dests = [outEl, inEl]

            const arrow = arrows.get(cable)!
            arrow.dests = dests
            arrow.holding = false
            $.arrows = arrows.set(cable, arrow)

            output.connect(input, cable)

            // $.dispatch.composed.bubbles(hovering, 'statechange')
          } else {
            $.arrows = arrows.delete(holding.cable)
          }

          for (const plugEl of plugs) {
            plugEl.classList.remove('disabled', 'active', 'enabled')
          }

          // $.dispatch.composed.bubbles(plugEl, 'statechange')
        }
      )
    )

    $.effect(({ plugs, startConnecting, endConnecting }) =>
      $.chain(
        [...plugs].map(plug => [
          $.on(plug).connectingstart(() => {
            startConnecting(plug)
          }),
          $.on(plug).connectingend(() => {
            endConnecting(plug)
          }),
        ])
      )
    )

    $.effect(({ plugs, solve }) =>
      $.chain(
        [...plugs].map(plugEl => plugEl.plug!).map(plug => [
          $.on(plug).connect(() => {
            solve()
          }),
          $.on(plug).disconnect(({ detail: { cable } }) => {
            if (!$.holding || $.holding.cable !== cable) {
              $.arrows = $.arrows.delete(cable)
            }
            solve()
          }),
        ])
      )
    )

    $.effect(({ holding, options }) => {
      if (!holding) return

      const cable = holding.cable

      const plugKind = holding.plug.plug!.plugKind
      let dests

      if (plugKind === Plug.Input) {
        dests = [holding.dest, holding.plug]
      } else {
        dests = [holding.plug, holding.dest]
      }

      let arrow: PlugArrow

      if ($.arrows.has(cable)) {
        arrow = $.arrows.get(cable)!
        arrow.dests = dests
      } else {
        arrow = new PlugArrow(cable, dests, options)
      }

      arrow.holding = true
      arrow.updatePoints()

      arrow.polygon = new Polygon(arrow.plugPoints)

      if (!$.arrows.has(cable)) {
        $.arrows = $.arrows.set(cable, arrow)
      }
    })

    $.effect(async ({ options, worker }) => {
      await worker.updateOptions(options)
    })

    $.effect(({ workspace }) =>
      workspace.$.effect(({ surface }) => {
        $.surface = surface
      })
    )

    $.draggingWindow = $.fulfill(({ workspace }) =>
      fulfill => {
        const start = (e: SurfaceMoveEvents['surfacemoveitemmove']) => {
          const [origin] = e.composedPath()
          if (origin instanceof SurfaceMoveElement || origin instanceof SurfaceResizeElement) {
            const { detail: { dest } } = e
            fulfill(dest as WorkspaceWindowElement)
          }
        }
        const end = () => {
          fulfill(false)
        }
        return workspace.$.effect(({ surface }) =>
          $.chain(
            $.on(surface).surfacemoveitemmovestart(start),
            $.on(surface).surfaceresizeitemresizestart(start),
            $.on(surface).surfacemoveitemmoveend(end),
            $.on(surface).surfaceresizeitemresizeend(end)
          )
        )
      }
    )

    $.effect(({ draggingWindow }) => {
      if (!draggingWindow) {
        $.plugs = new ImmSet($.plugs)
      }
    })

    $.destRects = $.reduce(({ plugs }) => [...plugs].map(x => Rect.fromElement(x.dest!)))

    $.effect(({ surface }) =>
      surface.$.effect(({ viewRect }) => {
        //!? 'got view rect', viewRect
        $.viewRect = viewRect
      })
    )

    $.effect(({ destRects, viewRect, worker }) => {
      worker.updateData({ destRects, viewRect })
    })

    $.effect(async ({ draggingWindow, solve }) => {
      if (!draggingWindow) {
        await solve()
      }
    })

    setTimeout(() => {
      // let initial = true

      $.effect(async ({ plugs, plugsMap, options, solve }) => {
        for (const outEl of plugs) {
          for (const [cable, plug] of outEl.plug!.cables.entries()) {
            if (plug.plugKind !== Plug.Input) continue

            if ($.arrows.has(cable)) continue

            const inEl = plugsMap.get(plug)!
            if (!inEl) continue

            const arrow = new PlugArrow(cable, [outEl, inEl], options)
            $.arrows = $.arrows.set(cable, arrow)

            await arrow.solve()
          }
        }
        // after the initial solve there are leftovers
        // that can be solved better in a second attempt because
        // of cell caching, so we repeat it. this makes the view
        // deterministic after a restart/reload of state
        await solve()

        // if (initial) {
        //   initial = false
        //   // setTimeout(() => {
        //   effect.once(({ surface }) => surface.centerView?.(SurfaceMode.Idle))
        //   // }, 100)
        // }
      })
    }, 1000)

    $.PlugArrows = $.part(({ WindowPlugArrow, workspace, arrows, holding }) =>
      [...arrows.values()].map(plugArrow => {
        return (
          <WindowPlugArrow
            key={plugArrow.id}
            holding={holding}
            color={`hsl(${(Math.round(parseInt(plugArrow.id, 36) / 25) * 25) % 360}, 40%, 50%)`}
            workspace={workspace}
            plugArrow={plugArrow}
            points={plugArrow.polygon.points}
          />
        )
      })
    )
  }
}
