// @vitest-environment jsdom
// Y-axis lock: dragging a parameter slider must change the CURVE (shape),
// not rescale the y-axis numbers. The axis ticks stay put; the polyline's
// screen coordinates move.
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlotBlock } from '../src/client/PlotBlock.tsx'

afterEach(cleanup)

describe('plot y-axis lock', () => {
  it('keeps y ticks stable while the curve changes on slider drag', () => {
    const { container } = render(<PlotBlock series={[
      { expr: 'a*x', label: '直线', params: [{ name: 'a', value: 1, min: 0, max: 5 }] },
    ]} />)
    // y 轴刻度（拖动前后应一致）
    const yTicksBefore = [...container.querySelectorAll('g')]
      .map(g => g.querySelector('text')?.textContent)
      .filter(Boolean)
      .filter(t => !t!.includes('.'))
    const polyBefore = container.querySelector('polyline')!.getAttribute('points')!
    // 拖动滑块 a: 1 -> 3
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '3' } })
    const yTicksAfter = [...container.querySelectorAll('g')]
      .map(g => g.querySelector('text')?.textContent)
      .filter(Boolean)
      .filter(t => !t!.includes('.'))
    const polyAfter = container.querySelector('polyline')!.getAttribute('points')!
    // 数轴刻度不变（y 轴锁定）
    expect(yTicksAfter).toEqual(yTicksBefore)
    // 曲线坐标变化（形态变了）
    expect(polyAfter).not.toBe(polyBefore)
  })
})
