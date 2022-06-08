import { add } from '../src/window-plug'

describe('add(a, b)', () => {
  it('adds two numbers together', () => {
    expect(add(1, 2)).toEqual(3)
  })
})
