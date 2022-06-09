import { Alice } from 'alice-bob'
import { Point, Rect } from 'geometrik'
import { deserialize, serialize } from 'serialize-whatever'
import type { WindowPlugWorker } from './window-plug-worker'

export class WindowPlugCore extends EventTarget {
  // declare onupdatepopup?: EventHandler<PopupSceneCore, CustomEvent<Popup>>

  // async updatePopup(popup: Popup) {
  //   this.dispatchEvent(new CustomEvent('updatepopup', { detail: popup }))
  // }
}

export const createWindowPlugWorker = () => {
  // @ts-ignore
  const workerUrl = new URL('./window-plug-worker.js', import.meta.url).href
  const worker = new Worker(workerUrl, { type: 'module' })

  const core = new WindowPlugCore()

  const [coreAgent, plugWorker] = new Alice<WindowPlugCore, WindowPlugWorker>(
    data => void worker.postMessage(send(data)),
    core
  ).agents({ debug: false })

  worker.onmessage = ({ data }) => coreAgent.receive(receive(data))

  return plugWorker
}

export const send = (data: any) => ({
  ...data,
  args: data.method.startsWith('__')
    ? data.method === '__resolve__' && data.args[1]
      ? [data.args[0], serialize(data.args[1])]
      : data.args
    : serialize(data.args),
})

const deserializableClasses = [
  Rect,
  Point,
]

export const receive = (data: any) => ({
  ...data,
  args: data.method.startsWith('__')
    ? data.method === '__resolve__' && data.args[1]
      ? [data.args[0], deserialize(data.args[1], deserializableClasses)]
      : data.args
    : deserialize(data.args, deserializableClasses),
})
