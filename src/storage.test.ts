import { describe, expect, it } from 'vitest'
import { createSeed, type Store } from './model'
import { parseWorkspace } from './storage'

function backup() {
  return { version: 1, store: createSeed(), demo: true }
}

describe('workspace storage validation', () => {
  it('accepts a complete backup and preserves the records', () => {
    const value = backup()
    expect(parseWorkspace(JSON.stringify(value))).toEqual({ store: value.store, demo: true })
  })

  it('accepts a clean empty business workspace', () => {
    const store: Store = { currency: 'ALL', products: [], customers: [], sales: [], movements: [] }
    expect(parseWorkspace(JSON.stringify({ version: 1, store, demo: false }))).toEqual({ store, demo: false })
  })

  it.each(['{', 'null', '[]', 'false', '{"version":2}', '{"version":1,"store":null,"demo":false}'])('rejects invalid structure %s', raw => {
    expect(() => parseWorkspace(raw)).toThrow(/No data was changed/)
  })

  it('rejects records missing fields before they can crash the interface', () => {
    const value = backup()
    delete (value.store.products[0] as Partial<Store['products'][number]>).name
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/name/)
  })

  it.each(['products', 'customers', 'sales', 'movements'] as const)('rejects duplicate IDs in %s', key => {
    const value = backup()
    const list = value.store[key]
    list[1].id = list[0].id
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/duplicate id/)
  })

  it('rejects blank IDs and duplicate sale numbers', () => {
    const value = backup()
    value.store.products[0].id = ' '
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/invalid id/)
    const other = backup()
    other.store.sales[1].number = other.store.sales[0].number
    expect(() => parseWorkspace(JSON.stringify(other))).toThrow(/duplicate number/)
  })

  it.each([-1, null, '12', 'NaN'])('rejects invalid stock %s', stock => {
    const value = backup()
    ;(value.store.products[0] as unknown as Record<string, unknown>).stock = stock
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/stock/)
  })

  it('rejects nonfinite JSON numbers', () => {
    const raw = JSON.stringify(backup()).replace('"stock":70', '"stock":1e999')
    expect(raw).toContain('1e999')
    expect(() => parseWorkspace(raw)).toThrow(/stock/)
  })

  it('rejects fractional count units and negative prices', () => {
    const value = backup()
    value.store.products[0].stock = 0.5
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/whole quantities/)
    const other = backup()
    other.store.sales[0].items[0].price = -1
    expect(() => parseWorkspace(JSON.stringify(other))).toThrow(/price/)
  })

  it('rejects zero-quantity order items and movements', () => {
    const value = backup()
    value.store.sales[0].items[0].quantity = 0
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/quantity/)
    const other = backup()
    other.store.movements[0].quantity = 0
    expect(() => parseWorkspace(JSON.stringify(other))).toThrow(/quantity/)
  })

  it('rejects empty orders and mismatched totals', () => {
    const value = backup()
    value.store.sales[0].items = []
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/at least one item/)
    const other = backup()
    other.store.sales[0].total += 1
    expect(() => parseWorkspace(JSON.stringify(other))).toThrow(/does not match/)
  })

  it('rejects invalid movement types and dates', () => {
    const value = backup()
    ;(value.store.movements[0] as unknown as Record<string, unknown>).type = 'unknown'
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/unsupported type/)
    const other = backup()
    other.store.sales[0].date = 'not a date'
    expect(() => parseWorkspace(JSON.stringify(other))).toThrow(/invalid date/)
  })

  it('preserves historical snapshots even when their customer or product is no longer in the catalog', () => {
    const value = backup()
    value.store.products = []
    value.store.customers = []
    expect(parseWorkspace(JSON.stringify(value)).store.sales).toEqual(value.store.sales)
  })

  it('rejects unsupported currencies and invalid demo flags', () => {
    const value = backup()
    value.store.currency = 'UNKNOWN'
    expect(() => parseWorkspace(JSON.stringify(value))).toThrow(/currency/)
    const other = { ...backup(), demo: 'yes' }
    expect(() => parseWorkspace(JSON.stringify(other))).toThrow(/sample workspace flag/)
  })
})
