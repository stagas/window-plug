/** @jsxImportSource sigl */
import $, { ValuesOf } from 'sigl'

import { createManualAnimation, ManualAnimation } from 'animatrix'
import { Cable, PlugKind } from 'plugs-and-cables'
import { Morph, Point, Polygon, Polyline, Rect } from 'sigl'
import { ContextMenuOption, SurfaceCursorState, SurfaceElement, SurfaceState, WorkspaceElement } from 'x-workspace'
import { roundCorners } from './vendor/svg-round-corners'

import { filterMap } from 'everyday-utils'
import { PlugArrow } from './plug-arrow'
import { WindowPlugElement } from './window-plug'

const settings = {
  chopMin: 0.0021,
  chopMax: 0.21,
  rope: 0.00005,
  friction: 0.4,
  speed: 0.68,
  speedCoeff: 9e-7,
  minVel: 18.5,
}

declare const console: Console & { edit?: any }
console.edit?.(settings)

interface WindowPlugArrowAnimation {
  points: Point[]
  pointsVel: Point[]
}

export const WindowPlugArrowState = {
  Idle: 'arrowidle',
  Drag: 'arrowdrag',
  Hold: 'arrowhold',
  Hover: 'arrowhover',
} as const

export enum WindowPlugArrowDragType {
  Head = 0,
  Tail = 1,
}

export type WindowPlugArrowEvents = {
  arrowhoverstart: CustomEvent<{ arrow: WindowPlugArrowElement }>
}

export interface WindowPlugArrowElement extends $.Element<WindowPlugArrowElement, WindowPlugArrowEvents> {}

@$.element()
export class WindowPlugArrowElement extends HTMLElement {
  @$.attr() state = $(this).state(WindowPlugArrowState)
  @$.attr() cableWidth = 7.5

  targetState?: ValuesOf<typeof WindowPlugArrowState> = WindowPlugArrowState.Idle

  color = '#66a'
  plugArrow?: PlugArrow
  workspace?: WorkspaceElement

  path?: string

  holding: { plug: WindowPlugElement; cable: Cable; dest: Point } | false = false
  zIndex = 0

  dragType: WindowPlugArrowDragType = WindowPlugArrowDragType.Head

  viewFrameNormalRect?: Rect

  onContextMenu?: (Options: () => JSX.Element) => $.EventHandler<any, MouseEvent>

  rect?: Rect
  points?: Point[]

  anim?: ManualAnimation<WindowPlugArrowAnimation>
  animValues?: WindowPlugArrowAnimation

  reconnectStart?: (kind: PlugKind) => $.EventHandler<SVGCircleElement, PointerEvent | TouchEvent>
  reconnectOutput?: $.EventHandler<SVGCircleElement, PointerEvent | TouchEvent>
  reconnectInput?: $.EventHandler<SVGCircleElement, PointerEvent | TouchEvent>

  mounted($: WindowPlugArrowElement['$']) {
    $.effect(({ workspace }) =>
      workspace.$.effect(({ surface }) =>
        $.effect(({ state }) => {
          if (state.isIdle) {
            if (surface.state.is(SurfaceState.Overlay)) {
              surface.state.pop(SurfaceState.Overlay)
            }
          } else if (state.is(WindowPlugArrowState.Hold)) {
            if (!surface.state.isIdle) {
              surface.state.pop(surface.state.current)
            }
            surface.state.push(SurfaceState.Overlay)
            surface.cursorState.push(SurfaceCursorState.Copy)
          }
        })
      )
    )

    let toDrag: any
    $.effect(({ plugArrow }) =>
      plugArrow.scene.$.effect(({ draggingWindow }) => {
        if (draggingWindow) {
          clearTimeout(toDrag)
          if ($.state.is(WindowPlugArrowState.Idle)) {
            const dests = filterMap(plugArrow.dests, x => x instanceof WindowPlugElement && x.dest)
            const isDragged = draggingWindow && dests.includes(draggingWindow)
            if (isDragged) {
              $.mutate(() => {
                $.state.push(WindowPlugArrowState.Drag)
                $.dragType = dests.indexOf(draggingWindow)
                $.zIndex = (SurfaceElement.zIndex << 1) - 1
              })
            }
          }
        } else {
          if ($.state.is(WindowPlugArrowState.Drag)) {
            $.mutate(() => {
              toDrag = setTimeout(() => {
                if ($.state.is(WindowPlugArrowState.Drag)) {
                  $.state.pop(WindowPlugArrowState.Drag)
                }
              }, 500)
              $.zIndex = 0
            })
          }
        }
      })
    )

    $.effect(({ host, rect, holding, plugArrow, zIndex }) => {
      const isHolding = holding ? holding.cable === plugArrow.cable : null

      Object.assign(host.style, {
        ...rect.toStyle(),
        zIndex,
        opacity: isHolding === false ? 0.5 : 1,
      })

      if (isHolding) {
        if ($.state.is(WindowPlugArrowState.Idle)) {
          $.state.push(WindowPlugArrowState.Hold)
          $.zIndex = SurfaceElement.zIndex + 1
        }
      } else {
        if ($.state.is(WindowPlugArrowState.Hold)) {
          $.state.pop(WindowPlugArrowState.Hold)
          $.zIndex = 0
        }
      }
      // const debug = document.getElementById('debug')
      // if (debug) {
      //   debug.textContent = JSON.stringify(settings, null, 2)
      // }
    })

    $.anim = $.reduce(() => createManualAnimation($.anim))

    $.effect(({ workspace }) =>
      workspace.$.effect(({ surface }) =>
        surface.$.effect(({ viewFrameNormalRect }) => {
          $.viewFrameNormalRect = viewFrameNormalRect
        })
      )
    )

    $.effect(({ workspace }) =>
      workspace.$.effect(({ onContextMenu }) => {
        $.onContextMenu = onContextMenu
      })
    )

    const roundAndPreventNaN = (points: Point[], fallback = '') => {
      const path = roundCorners(
        Polygon.toSVGPath(points),
        500
      ).path
      if (path.includes('NaN')) return fallback
      return path
    }

    $.effect(({ points: _ }) => {
      if (!$.rect) {
        $.rect = Polygon.boundingRect($.points ?? []).zoomLinear(100) // account for stroke width and round corners
      }
    })

    $.effect(({ state }) => {
      if (state.is(WindowPlugArrowState.Hover)) return

      if ($.points && (state.is(WindowPlugArrowState.Drag) || state.is(WindowPlugArrowState.Hold))) {
        const points = $.points
        $.path = roundAndPreventNaN(points, $.path)
        $.anim = createManualAnimation()
        $.animValues = $.anim.set({
          points,
          pointsVel: $.animValues?.pointsVel ?? Array.from({ length: points.length }, () => new Point()),
        })
      } else if ($.path && $.animValues) {
        $.anim = createManualAnimation()
        $.animValues = $.anim.set({
          points: $.animValues.points,
          pointsVel: $.animValues.pointsVel,
        })
      }
    })

    $.animValues = $.reduce(({ anim: { set }, points }) =>
      set({
        points,
        pointsVel: $.animValues?.pointsVel ?? Array.from({ length: points.length }, () => new Point()),
      })
    )

    $.animValues = $.reduce.raf(
      ({ anim: { current, stop, last, update }, plugArrow, state, animValues: _ }) => {
        if (state.is(WindowPlugArrowState.Hover)) {
          stop()
          return update(last)
        }

        if (!$.rect!.equals($.viewFrameNormalRect!)) {
          $.rect = $.viewFrameNormalRect
        }

        if (state.is(WindowPlugArrowState.Idle)) {
          plugArrow.updatePoints()
          const [outPoint, , , inPoint] = plugArrow.plugPoints

          const dest = last.points

          let points = current.points

          if (dest === points) {
            $.rect = Polygon.boundingRect($.points ?? []).zoomLinear(100) // account for stroke width and round corners
            return last
          }

          if (points.length !== dest.length) {
            points = Polygon.fit(points, dest.length)
          }

          const diff = dest.map((x, i) => x.screen(points[i]))

          if (diff.every(x => x.mag() < 0.1)) {
            stop()
            return update(last)
          }

          return update({
            points: [
              outPoint,
              ...(Polygon.morph(Morph.Nearest, points, last.points, 0.25).slice(1, -1)),
              inPoint,
            ],
            pointsVel: Array.from({ length: current.points.length }, () => new Point()),
          })
        } else if (state.is(WindowPlugArrowState.Hold)) {
          plugArrow.updatePoints()

          const [outPoint, startPoint, goalPoint, inPoint] = plugArrow.plugPoints

          let dest = [outPoint, startPoint, goalPoint, inPoint]

          // target = Polygon.chop(target, 0, 500)

          dest = Polygon.rope(
            dest,
            settings.rope
          )

          let points = current.points
          if (points.length !== dest.length) points = Polygon.fit(points, dest.length)

          // const length = Polyline.fromPoints(points).length

          let pointsVel = current.pointsVel // Polygon.fit(current.pointsVel, target.length)
          if (pointsVel.length !== dest.length) pointsVel = Polygon.fit(pointsVel, dest.length)

          points = [outPoint, startPoint, ...points.slice(2, -2), goalPoint, inPoint]

          return update({
            points: Polygon.morph(Morph.Nearest, current.points, points, 0.3),
            pointsVel,
          })

          //
        } else if (state.is(WindowPlugArrowState.Drag)) {
          plugArrow.updatePoints()

          const [outPoint, startPoint, goalPoint, inPoint] = plugArrow.plugPoints

          if (outPoint.equals(current.points[0]) && inPoint.equals(current.points.at(-1)!)) {
            return update({
              points: current.points,
              pointsVel: current.pointsVel,
            })
          }

          let dest = [
            outPoint,
            startPoint,
            ...current.points.slice(2, -2),
            goalPoint,
            inPoint,
          ]

          // const sliceAhead = target.length > 5 ? target.length * 0.15 | 0 : 0
          // for (let i = 0; i < 2; i++) {
          //     target = target.slice(0, sliceAhead)
          //       .concat(
          //         Polygon.rope(
          //           target,
          //           0.005
          //         ).slice(sliceAhead, -1)
          //       ).concat([target.at(-1)!])
          //     target = target.slice(0, 1).concat(
          //       Polygon.rope(
          //         target,
          //         0.005
          //       ).slice(1, -sliceAhead)
          //     ).concat(target.slice(-sliceAhead))
          //   }

          dest = Polygon.rope(
            dest,
            settings.rope
          )

          let points = current.points
          if (points.length !== dest.length) points = Polygon.fit(points, dest.length)

          const length = Polyline.fromPoints(points).length

          let pointsVel = current.pointsVel // Polygon.fit(current.pointsVel, target.length)
          if (pointsVel.length !== dest.length) pointsVel = Polygon.fit(pointsVel, dest.length)

          const diff = dest.map((x, i) => x.screen(points[i]))
          const speed = 1 - (settings.speed ** (length ** 2 * settings.speedCoeff))

          // const debug = document.getElementById('debug')
          // if (debug) {
          //   debug.textContent = JSON.stringify(settings, null, 2) + ' speed:' + speed
          // }

          pointsVel.forEach((x, i) => {
            x.scaleSelf(settings.friction).translateSelf(diff[i].scale(speed))
          })
          points.forEach((x, i) => {
            const vel = pointsVel[i]
            if (vel.mag() > settings.minVel) {
              x.translateSelf(vel)
            }
          })

          points = Polygon.chop(points, length * settings.chopMin, length * settings.chopMax)

          return update({
            points: [
              outPoint,
              startPoint,
              ...(Polygon.morph(Morph.Nearest, current.points, points, 0.3).slice(2, -2)),
              goalPoint,
              inPoint,
            ],
            pointsVel,
          })
        }
      }
    )

    $.effect.raf(({ animValues: { points } }) => {
      $.path = roundAndPreventNaN(points, $.path)
    })

    const Path = $.part(({ path }) => <path d={path} />)

    $.reconnectStart = $.reduce(({ plugArrow }) => (kind =>
      $.event.passive((e: PointerEvent | TouchEvent) => {
        if ((e as PointerEvent).buttons && !((e as PointerEvent).buttons & $.MouseButton.Left)) return

        if ((e as unknown as TouchEvent).touches) {
          // @ts-ignore
          e.pageX = e.touches[0].pageX
          // @ts-ignore
          e.pageY = e.touches[0].pageY
        }

        const [outPlug, inPlug] = plugArrow.plugs
        const cable = plugArrow.cable

        const [outEl, inEl] = [plugArrow.scene.plugsMap.get(outPlug!)!, plugArrow.scene.plugsMap.get(inPlug!)!]

        if (kind === PlugKind.Input) {
          ;(outEl.connectStart!(cable) as any).call(outEl, e)
        } else if (kind === PlugKind.Output) {
          ;(inEl.connectStart!(cable) as any).call(inEl, e)
        } else {
          throw new Error('Invalid plug kind: ' + kind)
        }

        outPlug!.disconnect(cable)
      }))
    )

    $.reconnectOutput = $.reduce(({ reconnectStart }) => reconnectStart(PlugKind.Output))
    $.reconnectInput = $.reduce(({ reconnectStart }) => reconnectStart(PlugKind.Input))

    // note: in mobile the pointerdown gets cancelled immediately
    // the workaround is to use touchstart and put pageX pageY into the event (see reconnectStart)
    // but obviously this needs a solution that is not hacky/fragile as this
    const Handles = $.part(({ host, animValues: { points }, reconnectOutput, reconnectInput, onContextMenu }) => (
      <>
        <circle
          key="c1"
          onpointerenter={() => {
            $.state.push(WindowPlugArrowState.Hover, { arrow: host })
          }}
          onpointerleave={() => {
            $.state.pop(WindowPlugArrowState.Hover)
          }}
          onpointercancel={() => {
            $.state.pop(WindowPlugArrowState.Hover)
          }}
          onpointerdown={!$.isMobile && reconnectOutput}
          ontouchstart={$.isMobile && reconnectOutput}
          oncontextmenu={onContextMenu(() => (
            <>
              <ContextMenuOption keyboard={['Alt', 'M']}>Mute</ContextMenuOption>
              <ContextMenuOption keyboard={['Alt', 'O']}>Solo</ContextMenuOption>
              <ContextMenuOption keyboard={['Alt', 'I']}>Inspect</ContextMenuOption>
              <hr />
              <ContextMenuOption keyboard={['Alt', 'X']}>Disconnect</ContextMenuOption>
            </>
          ))}
          class="arrow-handle-hover-area"
          cx={points[0].x}
          cy={points[0].y}
          r={30}
        />
        <circle
          key="c2"
          class="arrow-handle"
          onpointerenter={() => {
            $.state.push(WindowPlugArrowState.Hover, { arrow: host })
          }}
          onpointerleave={() => {
            $.state.pop(WindowPlugArrowState.Hover)
          }}
          onpointercancel={() => {
            $.state.pop(WindowPlugArrowState.Hover)
          }}
          onpointerdown={!$.isMobile && reconnectOutput}
          ontouchstart={$.isMobile && reconnectOutput}
          oncontextmenu={onContextMenu(() => (
            <>
              <ContextMenuOption keyboard={['Alt', 'M']}>Mute</ContextMenuOption>
              <ContextMenuOption keyboard={['Alt', 'O']}>Solo</ContextMenuOption>
              <ContextMenuOption keyboard={['Alt', 'I']}>Inspect</ContextMenuOption>
              <hr />
              <ContextMenuOption keyboard={['Alt', 'X']}>Disconnect</ContextMenuOption>
            </>
          ))}
          cx={points[0].x}
          cy={points[0].y}
          r={20}
        />
        <circle
          key="c3"
          onpointerenter={() => {
            $.state.push(WindowPlugArrowState.Hover, { arrow: host })
          }}
          onpointerleave={() => {
            $.state.pop(WindowPlugArrowState.Hover)
          }}
          onpointercancel={() => {
            $.state.pop(WindowPlugArrowState.Hover)
          }}
          onpointerdown={!$.isMobile && reconnectInput}
          ontouchstart={$.isMobile && reconnectInput}
          oncontextmenu={onContextMenu(() => (
            <>
              <ContextMenuOption keyboard={['Alt', 'M']}>Mute</ContextMenuOption>
              <ContextMenuOption keyboard={['Alt', 'O']}>Solo</ContextMenuOption>
              <ContextMenuOption keyboard={['Alt', 'I']}>Inspect</ContextMenuOption>
              <hr />
              <ContextMenuOption keyboard={['Alt', 'X']}>Disconnect</ContextMenuOption>
            </>
          ))}
          class="arrow-handle-hover-area"
          cx={points.at(-1)!.x}
          cy={points.at(-1)!.y}
          r={30}
        />
        <circle
          key="c4"
          class="arrow-handle"
          onpointerenter={() => {
            $.state.push(WindowPlugArrowState.Hover, { arrow: host })
          }}
          onpointerleave={() => {
            $.state.pop(WindowPlugArrowState.Hover)
          }}
          onpointercancel={() => {
            $.state.pop(WindowPlugArrowState.Hover)
          }}
          onpointerdown={!$.isMobile && reconnectInput}
          ontouchstart={$.isMobile && reconnectInput}
          oncontextmenu={onContextMenu(() => (
            <>
              <ContextMenuOption keyboard={['Alt', 'M']}>Mute</ContextMenuOption>
              <ContextMenuOption keyboard={['Alt', 'O']}>Solo</ContextMenuOption>
              <ContextMenuOption keyboard={['Alt', 'I']}>Inspect</ContextMenuOption>
              <hr />
              <ContextMenuOption keyboard={['Alt', 'X']}>Disconnect</ContextMenuOption>
            </>
          ))}
          cx={points.at(-1)!.x}
          cy={points.at(-1)!.y}
          r={20}
        />
      </>
    ))

    const Svg = $.part(({ rect }) => (
      <svg
        width={rect.width}
        height={rect.height}
        viewBox={`${rect.pos.x} ${rect.pos.y} ${rect.width} ${rect.height}`}
      >
        <g class="cable">
          <Path />
          <Handles />
        </g>
      </svg>
    ))

    $.render(({ color, cableWidth }) => (
      <>
        <style>
          {$.css /*css*/`
          :host {
            display: inline-flex;
            contain: size layout style paint;
            pointer-events: none;
          }
          svg {
            --color: ${color};
            /* shape-rendering: optimizeSpeed; */
          }
          circle {
            &.arrow-handle {
              fill: var(--color);
              stroke: none;
              z-index: 1;

              &-hover-area {
                fill: transparent;
              }
            }
          }
          path {
            pointer-events: none;
            stroke: var(--color);
            stroke-width: ${cableWidth}px;
            fill: none;
            z-index: 0;
          }
          :host([state=hold]) path {
            stroke-width: ${cableWidth * 2}px;
          }

          .cable,
          .cable:hover circle {
            pointer-events: painted;
          }
          .cable:hover {
            --color: #fff;
          }
          /* weird bug causes :hover color to stay on when
             reconnecting so we are overriding it again */
          :host([state=hold]) .cable {
            --color: ${color};
          }
        `('')}
        </style>
        <Svg />
      </>
    ))
  }
}
