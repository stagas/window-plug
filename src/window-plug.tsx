/** @jsxImportSource sigl */
import $ from 'sigl'

import { pick } from 'everyday-utils'
import { Point } from 'geometrik'
import { Cable, Plug } from 'plugs-and-cables'
import { WorkspaceWindowElement } from 'x-workspace'

import { WindowPlugSceneElement } from './window-plug-scene'

export type WindowPlugEvents = {
  statechange: CustomEvent
  connectingstart: CustomEvent
  connectingmove: CustomEvent
  connectingend: CustomEvent
}

export const WindowPlugState = {
  Idle: 'idle',
  Connecting: 'connecting',
}

export interface WindowPlugElement extends $.Element<WindowPlugElement, WindowPlugEvents> {}

@$.element()
export class WindowPlugElement extends $.mix(HTMLElement, $.mixins.observed()) {
  @$.attr() state = $(this).state(WindowPlugState)
  @$.out() plug?: Plug<any, any>

  dest?: $.ChildOf<WorkspaceWindowElement>
  scene?: WindowPlugSceneElement

  count = 1
  resize?: () => void
  connectStart?: (cable?: Cable) => $.EventHandler<WindowPlugElement, PointerEvent>

  mounted($: WindowPlugElement['$']) {
    $.effect(({ host, scene, dest: _ }) => {
      scene.addPlug?.(host)
      return () => scene.removePlug?.(host)
    })

    $.effect(({ host, plug }) => {
      // host.title = `${plug.cableKind} ${plug.plugKind}`
      $.dataset(host, pick(plug, ['cableKind', 'plugKind']))
    })

    $.connectStart = $.reduce(({ host, scene, dest }) =>
      (cable = new Cable()) =>
        $.event.stop(e => {
          const o = dest.surface!.rect.pos
          const p = new Point(e.pageX, e.pageY)
            .subSelf(o)
            .normalize(dest.surface!.matrix)

          scene.holding = { plug: host, cable, dest: p }

          $.state.push(WindowPlugState.Connecting)

          const clear = () => {
            removeListeners()
            $.state.pop(WindowPlugState.Connecting)
          }

          const onPointerMove = $.on(window).pointermove.stop(e => {
            p.set(
              new Point(e.pageX, e.pageY)
                .subSelf(o)
                .normalize(dest.surface!.matrix)
            )

            $.state.emit(WindowPlugState.Connecting)
          })

          const offPointerUp = $.on(window).pointerup.stop.prevent(clear)
          const offPointerCancel = $.on(window).pointercancel.stop.prevent(clear)
          const removeListeners = $.chain(onPointerMove, offPointerUp, offPointerCancel)
        })
    )

    $.effect(({ host, connectStart }) =>
      $.on(host).pointerdown(e => {
        if (!(e.buttons & $.MouseButton.Left)) return
        return connectStart().call(host, e)
      })
    )

    $.effect(({ plug, resize }) =>
      $.chain(
        $.on(plug).connect(resize),
        $.on(plug).disconnect(resize)
      )
    )

    $.resize = $.reduce(({ plug }) => (() => {
      $.count = plug.cables.size
    }))

    $.effect(({ resize }) => resize())

    $.render(({ count }) => (
      <>
        <style>
          {/*css*/ `
          :host {
            box-sizing: border-box;
            contain: size layout style paint;
            position: relative;
            height: ${(count + 1) * 50}px;
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
  }
}
