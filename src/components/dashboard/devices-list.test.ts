import { describe, expect, it } from 'vitest'
import { getDeviceLimitState } from './devices-list'

describe('состояние лимита устройств', () => {
  it.each([
    [0, null, 'neutral', 'Без ограничений'],
    [3, 5, 'neutral', 'Свободно: 2'],
    [4, 5, 'warning', 'Осталось 1 место'],
    [5, 5, 'danger', 'Лимит достигнут. Отключите ненужное устройство.'],
    [7, 5, 'danger', 'Лимит превышен на 2. Отключите лишнее устройство.'],
  ] as const)('показывает %s из %s', (used, limit, tone, text) => {
    expect(getDeviceLimitState(used, limit)).toEqual({ tone, text })
  })
})
