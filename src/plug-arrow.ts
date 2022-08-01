import { Point, Polygon } from 'geometrik'
import { Cable } from 'plugs-and-cables'
import { WindowPlugSolveOptions } from './types'
import { WindowPlugElement } from './window-plug'

export class PlugArrow {
  static map = new WeakMap<Cable, PlugArrow>()

  plugPoints!: [Point, Point, Point, Point]
  polygon!: Polygon
  holding = false

  constructor(
    public cable: Cable,
    public dests: (WindowPlugElement | Point)[],
    public options: WindowPlugSolveOptions,
  ) {
    if (PlugArrow.map.has(cable)) {
      return PlugArrow.map.get(cable)!
    }
    PlugArrow.map.set(cable, this)
    this.updatePoints()
    this.polygon = new Polygon(this.plugPoints)
  }

  get id() {
    return this.cable.id
  }

  get scene() {
    return this.dests[0] instanceof WindowPlugElement
      ? this.dests[0].scene!
      : (this.dests[1] as WindowPlugElement).scene!
  }

  get plugs() {
    return this.dests.map(x => (x as WindowPlugElement)?.plug)
  }

  // TODO: this can be reactive? targets + plugs can emit "change"
  updatePoints() {
    const [outEl, inEl] = this.dests
    const [outPlug, inPlug] = this.plugs

    let outPoint: Point
    let inPoint: Point

    if (outEl instanceof WindowPlugElement) {
      const outsCount = this.holding ? outPlug!.cables.size : [...outPlug!.cables.keys()].indexOf(this.cable)
      const rect = outEl.ownRect.sub(outEl.scene!.surface!.rect.pos)
      outPoint = new Point(
        rect.right,
        rect.y + outsCount * 50 + 25
      )
    } else {
      outPoint = outEl
    }

    if (inEl instanceof WindowPlugElement) {
      const insCount = this.holding ? inPlug!.cables.size : [...inPlug!.cables.keys()].indexOf(this.cable)
      const rect = inEl.ownRect.sub(inEl.scene!.surface!.rect.pos)
      inPoint = new Point(
        rect.left,
        rect.y + insCount * 50 + 25
      )
    } else {
      inPoint = inEl
    }

    const startPoint = outPoint.translate(this.options.step * 0.5, 0)
    const goalPoint = inPoint.translate(-this.options.step * 0.5, 0)

    this.plugPoints = [
      outPoint,
      startPoint,
      goalPoint,
      inPoint,
    ]
  }

  async solve() {
    if (this.dests.every(x => x instanceof WindowPlugElement)) {
      this.updatePoints()
      this.polygon = await this.scene.worker.getArrowPolygon(this.id, ...this.plugPoints)
    }
  }
}
