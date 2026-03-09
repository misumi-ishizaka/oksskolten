import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsStandalone } from './use-is-standalone'

describe('useIsStandalone', () => {
  let changeListeners: Array<(e: { matches: boolean }) => void>
  let matchesValue: boolean

  beforeEach(() => {
    changeListeners = []
    matchesValue = false

    // Reset iOS standalone property
    Object.defineProperty(navigator, 'standalone', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: matchesValue,
      media: query,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        changeListeners.push(cb)
      },
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        changeListeners = changeListeners.filter(l => l !== cb)
      },
    })))
  })

  it('returns false by default', () => {
    const { result } = renderHook(() => useIsStandalone())
    expect(result.current).toBe(false)
  })

  it('returns true when display-mode: standalone matches', () => {
    matchesValue = true
    const { result } = renderHook(() => useIsStandalone())
    expect(result.current).toBe(true)
  })

  it('returns true when iOS navigator.standalone is true', () => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    })
    matchesValue = false
    const { result } = renderHook(() => useIsStandalone())
    expect(result.current).toBe(true)
  })

  it('updates when media query changes', () => {
    matchesValue = false
    const { result } = renderHook(() => useIsStandalone())
    expect(result.current).toBe(false)

    act(() => {
      changeListeners.forEach(cb => cb({ matches: true }))
    })
    expect(result.current).toBe(true)
  })

  it('cleans up listener on unmount', () => {
    const { unmount } = renderHook(() => useIsStandalone())
    expect(changeListeners).toHaveLength(1)
    unmount()
    expect(changeListeners).toHaveLength(0)
  })
})
