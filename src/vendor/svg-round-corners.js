/* eslint-disable no-inner-declarations */
/* eslint-disable no-case-declarations */
function roundValues(el, round) {
  Object.keys(el.values).forEach(key => el.values[key] = el.values[key] && parseFloat(el.values[key].toFixed(round)))
  return el
}
function getPreviousNoZ(e, i, a) {
  const counter = i - 1
  const previous = a[mod(counter, a.length)]
  if (previous.marker !== 'Z') {
    return previous
  } else {
    return getPreviousNoZ(e, counter, a)
  }
}
function getNextNoZ(e, i, a) {
  const counter = i + 1
  const next = a[mod(counter, a.length)]
  if (next.marker === 'Z') {
    return getNextNoZ(e, counter, a)
  } else {
    return next
  }
}
function convertToAbsolute(el, index, arr) {
  let prev = arr[index - 1] || { values: { x: 0, y: 0 } }
  if (el.marker === el.marker.toLowerCase()) {
    el.marker = el.marker.toUpperCase()
    switch (el.marker) {
      case 'M':
        el.values.x += prev.values.x
        el.values.y += prev.values.y
        break
      case 'L':
      case 'A':
        el.values.x += prev.values.x
        el.values.y += prev.values.y
        break
      case 'H':
        el.marker = 'L'
        el.values.x += prev.values.x
        el.values.y = prev.values.y
        break
      case 'V':
        el.marker = 'L'
        el.values.x = prev.values.x
        el.values.y += prev.values.y
        break
      case 'C':
        el.values.x += prev.values.x
        el.values.y += prev.values.y
        el.values.x1 += prev.values.x
        el.values.y1 += prev.values.y
        el.values.x2 += prev.values.x
        el.values.y2 += prev.values.y
        break
      case 'S':
        el.values.x += prev.values.x
        el.values.y += prev.values.y
        el.values.x2 += prev.values.x
        el.values.y2 += prev.values.y
        break
      case 'Q':
        el.values.x += prev.values.x
        el.values.y += prev.values.y
        el.values.x1 += prev.values.x
        el.values.y1 += prev.values.y
        break
      case 'T':
        el.values.x += prev.values.x
        el.values.y += prev.values.y
        break
    }
  } else if (el.marker === el.marker.toUpperCase()) {
    switch (el.marker) {
      case 'H':
        el.marker = 'L'
        el.values.y = prev.values.y
        break
      case 'V':
        el.marker = 'L'
        el.values.x = prev.values.x
        break
    }
  }
  if (el.marker === 'Z') {
    function rec(arr2, i) {
      if (arr2[i].marker === 'M') {
        return arr2[i]
      } else {
        return rec(arr2, i - 1)
      }
    }
    let mBefore = rec(arr, index)
    el.values.x = mBefore.values.x
    el.values.y = mBefore.values.y
  }
  return el
}
function newCommands(marker, values) {
  const cmds = []
  switch (marker.toUpperCase()) {
    case 'M':
      for (let i = 0; i < values.length; i += 2) {
        let m
        if (marker === marker.toUpperCase()) {
          m = i === 0 ? 'M' : 'L'
        } else {
          m = i === 0 ? 'm' : 'l'
        }
        cmds.push({
          marker: m,
          values: {
            x: values[i],
            y: values[i + 1],
          },
        })
      }
      break
    case 'L':
      for (let i = 0; i < values.length; i += 2) {
        cmds.push({
          marker,
          values: {
            x: values[i],
            y: values[i + 1],
          },
        })
      }
      break
    case 'H':
      for (let i = 0; i < values.length; i++) {
        cmds.push({
          marker,
          values: {
            x: values[i],
            y: 0,
          },
        })
      }
      break
    case 'V':
      for (let i = 0; i < values.length; i++) {
        cmds.push({
          marker,
          values: {
            x: 0,
            y: values[i],
          },
        })
      }
      break
    case 'C':
      for (let i = 0; i < values.length; i += 6) {
        cmds.push({
          marker,
          values: {
            x1: values[i],
            y1: values[i + 1],
            x2: values[i + 2],
            y2: values[i + 3],
            x: values[i + 4],
            y: values[i + 5],
          },
        })
      }
      break
    case 'S':
      for (let i = 0; i < values.length; i += 4) {
        cmds.push({
          marker,
          values: {
            x2: values[i],
            y2: values[i + 1],
            x: values[i + 2],
            y: values[i + 3],
          },
        })
      }
      break
    case 'Q':
      for (let i = 0; i < values.length; i += 4) {
        cmds.push({
          marker,
          values: {
            x1: values[i],
            y1: values[i + 1],
            x: values[i + 2],
            y: values[i + 3],
          },
        })
      }
      break
    case 'T':
      for (let i = 0; i < values.length; i += 2) {
        cmds.push({
          marker,
          values: {
            x: values[i],
            y: values[i + 1],
          },
        })
      }
      break
    case 'A':
      for (let i = 0; i < values.length; i += 7) {
        cmds.push({
          marker,
          values: {
            radiusX: values[i],
            radiusY: values[i + 1],
            rotation: values[i + 2],
            largeArc: values[i + 3],
            sweep: values[i + 4],
            x: values[i + 5],
            y: values[i + 6],
          },
        })
      }
      break
    case 'Z':
      cmds.push({
        marker,
        values: {
          x: 0,
          y: 0,
        },
      })

      break
  }

  return cmds
}
function mod(x, m) {
  return (x % m + m) % m
}
function markOverlapped(el, index, array) {
  if (index !== 0 && el.marker === 'L') {
    let previous = array[index - 1]
    const overlap = ['x', 'y'].every(key => {
      return Math.round(Math.abs(previous.values[key] - el.values[key])) === 0
    })
    if (overlap) {
      el.overlap = true
    }
  }
  return el
}
function reverseMarkOverlapped(cmds, counter) {
  const overlap = ['x', 'y'].every(key => {
    return Math.round(Math.abs(cmds[counter].values[key] - cmds[0].values[key])) === 0
  })
  if (cmds[counter].marker === 'L' && overlap) {
    cmds[counter].overlap = true
    reverseMarkOverlapped(cmds, counter - 1)
  }
  if (cmds[counter].marker === 'Z') {
    reverseMarkOverlapped(cmds, counter - 1)
  }
}
function shortestSide(el, previous, next) {
  const nxtSide = getDistance(el.values, next.values)
  const prvSide = getDistance(previous.values, el.values)
  return Math.min(prvSide, nxtSide)
}
function getAngle(p1, p2) {
  return Math.atan2(p2.x - p1.x, p2.y - p1.y)
}
function getDistance(p1, p2) {
  const xDiff = p1.x - p2.x
  const yDiff = p1.y - p2.y
  return Math.sqrt(Math.pow(xDiff, 2) + Math.pow(yDiff, 2))
}
function getOppositeLength(angle, hip) {
  return Math.sin(angle) * hip
}
function getAdjacentLength(angle, hip) {
  return Math.cos(angle) * hip
}
function getTangentLength(angle, opposite) {
  const a = opposite / Math.tan(angle)
  if (a === Infinity || a === -Infinity) {
    return opposite
  }
  return a
}
function getTangentNoHyp(angle, adjacent) {
  return adjacent * Math.tan(angle)
}
function getOffset(angle, r) {
  let offset
  let sweepFlag = 0
  let degrees = angle * (180 / Math.PI)
  if (degrees < 0 && degrees >= -180 || degrees > 180 && degrees < 360) {
    offset = getTangentLength(angle / 2, -r)
  } else {
    offset = getTangentLength(angle / 2, r)
    sweepFlag = 1
    if (offset === Infinity) {
      offset = r
    }
  }
  return {
    offset,
    sweepFlag,
  }
}
function commandsToSvgPath(cmds) {
  const valuesOrder = [
    'radiusX',
    'radiusY',
    'rotation',
    'largeArc',
    'sweep',
    'x1',
    'y1',
    'x2',
    'y2',
    'x',
    'y',
  ]

  return cmds.map(cmd => {
    let d = ''
    if (cmd.marker !== 'Z') {
      const cmdKeys = Object.keys(cmd.values)
      d = valuesOrder.filter(v => cmdKeys.indexOf(v) !== -1).map(key => cmd.values[key]).join()
    }
    return `${cmd.marker}${d}`
  }).join('').trim()
}
function parsePath(str) {
  const markerRegEx = /[MmLlSsQqLlHhVvCcSsQqTtAaZz]/g
  const digitRegEx = /-?[0-9]*\.?\d+/g
  return [...str.matchAll(markerRegEx)].map(match => {
    return { marker: match[0], index: match.index }
  }).reduceRight((acc, cur) => {
    const chunk = str.substring(cur.index, acc.length ? acc[acc.length - 1].index : str.length)
    return acc.concat([
      {
        marker: cur.marker,
        index: cur.index,
        chunk: chunk.length > 0 ? chunk.substr(1, chunk.length - 1) : chunk,
      },
    ])
  }, []).reverse().flatMap(cmd => {
    const values = cmd.chunk.match(digitRegEx)
    const vals = values ? values.map(parseFloat) : []
    return newCommands(cmd.marker, vals)
  }).map(convertToAbsolute)
}
function roundCommands(cmds, r, round) {
  let subpaths = []
  let newCmds = []
  if (round) {
    cmds.forEach(el => roundValues(el, round))
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cmds.forEach((e, i, a) => {
    if (e.marker === 'M') {
      subpaths.push([])
    }
    subpaths[subpaths.length - 1].push(e)
  })
  subpaths.forEach(subPathCmds => {
    subPathCmds.map(markOverlapped)
    reverseMarkOverlapped(subPathCmds, subPathCmds.length - 1)
    const closedPath = subPathCmds[subPathCmds.length - 1].marker == 'Z'
    subPathCmds.filter(el => !el.overlap).map((el, i, arr) => {
      const largeArcFlag = 0
      const prev = getPreviousNoZ(el, i, arr)
      const next = getNextNoZ(el, i, arr)
      const anglePrv = getAngle(el.values, prev.values)
      const angleNxt = getAngle(el.values, next.values)
      const angle = angleNxt - anglePrv
      const degrees = angle * (180 / Math.PI)
      const shortest = shortestSide(el, prev, next)
      const maxRadius = Math.abs(getTangentNoHyp(angle / 2, shortest / 2))
      const radius = Math.min(r, maxRadius)
      const o = getOffset(angle, radius)
      const offset = o.offset
      const sweepFlag = o.sweepFlag
      const openFirstOrLast = (i == 0 || i == arr.length - 1) && !closedPath
      switch (el.marker) {
        case 'M':
        case 'L':
          const prevPoint = [
            el.values.x + getOppositeLength(anglePrv, offset),
            el.values.y + getAdjacentLength(anglePrv, offset),
          ]

          const nextPoint = [
            el.values.x + getOppositeLength(angleNxt, offset),
            el.values.y + getAdjacentLength(angleNxt, offset),
          ]

          if (!openFirstOrLast) {
            newCmds.push({
              marker: el.marker,
              values: {
                x: parseFloat(prevPoint[0].toFixed(3)),
                y: parseFloat(prevPoint[1].toFixed(3)),
              },
            })
          } else {
            newCmds.push({
              marker: el.marker,
              values: el.values,
            })
          }
          if (!openFirstOrLast && (next.marker === 'L' || next.marker === 'M')) {
            newCmds.push({
              marker: 'A',
              radius,
              values: {
                radiusX: radius,
                radiusY: radius,
                rotation: degrees,
                largeArc: largeArcFlag,
                sweep: sweepFlag,
                x: parseFloat(nextPoint[0].toFixed(3)),
                y: parseFloat(nextPoint[1].toFixed(3)),
              },
            })
          }
          break
        case 'C':
        case 'S':
        case 'Q':
        case 'T':
        case 'A':
        case 'Z':
          newCmds.push({ marker: el.marker, values: el.values })
          break
      }
    })
  })
  return {
    path: commandsToSvgPath(newCmds),
    commands: newCmds,
  }
}
function roundCorners(str, r, round) {
  return roundCommands([...parsePath(str)], r, round)
}
var svgRoundCorners = null

export { parsePath, roundCommands, roundCorners, svgRoundCorners as default }
