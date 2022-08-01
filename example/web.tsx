/** @jsxImportSource sigl */
import $ from 'sigl'

import { deserialize, serialize } from 'serialize-whatever'
import { ContextMenuOption, WorkspaceElement, WorkspaceWindowElement } from 'x-workspace'
import { Cable, Plug, WindowPlugElement, WindowPlugSceneElement } from '..'

const IO = {
  Midi: 'midi',
  Audio: 'audio',
} as const

interface WindowItemElement extends $.Element<WindowItemElement> {}

@$.element()
class WindowItemElement extends $(WorkspaceWindowElement) {
  WindowPlug = $.element(WindowPlugElement)

  plugScene?: WindowPlugSceneElement

  @$.out() inputs = new $.RefSet<WindowPlugElement>([
    { plug: new Plug(Plug.Input, IO.Midi) },
    { plug: new Plug(Plug.Input, IO.Audio) },
  ])

  @$.out() outputs = new $.RefSet<WindowPlugElement>([
    { plug: new Plug(Plug.Output, IO.Midi) },
    { plug: new Plug(Plug.Output, IO.Audio) },
  ])

  mounted($: WindowItemElement['$']) {
    $.Controls = $.part(() => <div></div>)

    $.ContextMenu = $.part(() => (
      <>
        <ContextMenuOption keyboard={['Ctrl', 'N']}>New</ContextMenuOption>
        <ContextMenuOption keyboard={['Alt', 'R']}>Remove the thing</ContextMenuOption>
        <ContextMenuOption>and another</ContextMenuOption>
        <hr />
        <ContextMenuOption disabled>and another</ContextMenuOption>
        <ContextMenuOption>and another</ContextMenuOption>
      </>
    ))

    const Plugs = $.part(({ host, WindowPlug, plugScene, inputs, outputs, onContextMenu }) => (
      <div part="plugs">
        {[
          ['inputs', inputs] as const,
          ['outputs', outputs] as const,
        ].map(([part, plugs]) => (
          <div part={part}>
            {plugs.map(plug => (
              <WindowPlug
                {...plug}
                part="plug"
                dest={host}
                scene={plugScene}
                oncontextmenu={onContextMenu(() => (
                  <>
                    <ContextMenuOption keyboard={['Alt', 'M']} disabled={!plug.ref.current?.plug?.cables.size}>
                      Mute All
                    </ContextMenuOption>
                    <ContextMenuOption keyboard={['Alt', 'D']} disabled={!plug.ref.current?.plug?.cables.size}>
                      Disconnect All
                    </ContextMenuOption>
                  </>
                ))}
              />
            ))}
          </div>
        ))}
      </div>
    ))

    $.Item = $.part(({ WindowPlug }) => (
      <>
        <style>
          {/*css*/ `
          :host {
            --audio: #09f;
            --midi: #a80;
            --plug-width: 28px;
            display: flex;
            width: 100%;
            height: 100%;
            position: relative;
          }
          [part=plugs] {
            position: absolute;
            height: 100%;
            width: 100%;
          }
          [part=plugs] > * {
            width: var(--plug-width);
            height: 100%;
            pointer-events: none;

            display: flex;
            flex-flow: column nowrap;
            align-items: center;
            justify-content: center;

            position: absolute;
            gap: 20px;
          }
          [part=inputs] {
            left: calc(-1 * var(--plug-width));
            top: 0;
          }
          [part=outputs] {
            right: calc(-1 * var(--plug-width));
            top: 0;
          }
          [part=plug] {
            display: inline-flex;
            width: var(--plug-width);
            pointer-events: all;
            cursor: copy;
          }
          [part=inputs] [part=plug] {
          }
          [part=outputs] [part=plug] {
          }
          [data-cable-kind=audio][data-plug-kind=input]::part(plug) {
            background: var(--audio);
          }
          [data-cable-kind=audio][data-plug-kind=output]::part(plug) {
            background: var(--audio);
          }
          [data-cable-kind=midi][data-plug-kind=input]::part(plug) {
            background: var(--midi);
          }
          [data-cable-kind=midi][data-plug-kind=output]::part(plug) {
            background: var(--midi);
          }
          ${WindowPlug}::part(plug) {
            /* opacity: 0.55; */
            /* transition: opacity 78ms cubic-bezier(0, 0.35, .15, 1); */
            z-index: 1;
          }
          ${WindowPlug}::part(back) {
            background: #000;
            z-index: 0;
          }
          ${WindowPlug}:hover::part(plug) {
            /* opacity: 0.75; */
          }
          ${WindowPlug}.disabled::part(plug) {
            opacity: 0.2;
          }
          ${WindowPlug}.enabled::part(plug) {
            opacity: 0.85;
          }
          ${WindowPlug}.active::part(plug) {
            /* opacity: 1; */
          }
        `}
        </style>

        <Plugs />

        <div>hello this is a window</div>
      </>
    ))
  }
}

interface SceneElement extends $.Element<SceneElement> {}

@$.element()
class SceneElement extends HTMLElement {
  Workspace = $.element(WorkspaceElement)
  WindowItem = $.element(WindowItemElement)
  WindowPlugScene = $.element(WindowPlugSceneElement)

  workspace?: WorkspaceElement
  plugScene?: WindowPlugSceneElement

  @$.out() items = new $.RefSet<WindowItemElement>([
    { rect: new $.Rect(0, 0, 200, 200), label: 'one' },
    { rect: new $.Rect(300, 0, 200, 200), label: 'two' },
  ])

  mounted($: SceneElement['$']) {
    const PlugScene = $.part(({ WindowPlugScene, workspace }) => (
      <WindowPlugScene ref={$.ref.plugScene} workspace={workspace} />
    ))

    const PlugArrows = $.part(({ plugScene: { PlugArrows } }) => <PlugArrows />)

    const Items = $.part(({ WindowItem, items, plugScene }) =>
      items.map(item => <WindowItem {...item} plugScene={plugScene} />)
    )

    $.render(({ Workspace, WindowItem }) => (
      <>
        <style>
          {/*css*/ `
          ${Workspace} {
            position: absolute;
            display: flex;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }

          ${WindowItem} {
            box-sizing: border-box;
            background: #000;
            z-index: 1;
            /* border: 5px solid pink; */
          }
          ${WindowItem}.connect-hover {
            /* border: 5px solid purple; */
          }
        `}
        </style>
        <Workspace ref={$.ref.workspace}>
          <Items />
          <PlugArrows />
        </Workspace>
        <PlugScene />
      </>
    ))
  }
}

const Scene = $.element(SceneElement)

const Classes = [
  $.Rect,
  $.RefSet,
  Cable,
  Plug,
  SceneElement,
]

const sceneRef = new $.Ref()
const historyItems = new Set<string>()
const History = () => {
  return [...historyItems].map((x, i) => (
    <button
      onclick={() => {
        sceneRef.current = deserialize(x, Classes)
        render()
      }}
    >
      {i}
    </button>
  ))
}

if (localStorage.lastScene) {
  sceneRef.current = deserialize(localStorage.lastScene, Classes)
}

const render = () => {
  $.render(
    <>
      <div style="z-index: 999999; position: fixed;">
        <History />
      </div>
      <Scene
        ref={sceneRef}
        onchange={$.event.debounce(200)(() => {
          console.time('serialize')
          const serialized = serialize(sceneRef.current)
          historyItems.add(serialized)
          localStorage.lastScene = serialized
          console.log('size:', serialized.length)
          console.timeEnd('serialize')
          render()
        })}
      />
    </>,
    document.body
  )
}

render()
