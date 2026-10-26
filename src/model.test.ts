import { describe, expect, it } from 'vitest'
import { createSeed, formatMoney, receiveStock, recordSale, type Store } from './model'

function fixture(): Store {
  return {
    currency: 'EUR', sales: [], movements: [],
    customers: [{ id: 'customer', name: 'The Test Kitchen', contact: '', email: '', phone: '', address: '' }],
    products: [{ id: 'rice', name: 'Rice', sku: 'R1', category: 'Grains', unit: 'kg', cost: 1.5, price: 3, stock: 0, reorderLevel: 5, color: 'sand' }],
  }
}

describe('inventory and sales', () => {
  it('receives fractional weight, sells it at an override price, and snapshots the order', () => {
    const original = fixture()
    const received = receiveStock(original, { productId: 'rice', quantity: 12.5, cost: 1.7 })
    const sold = recordSale(received, { customerId: 'customer', items: [{ productId: 'rice', quantity: 2.5, price: 2.8 }] })
    expect(original.products[0].stock).toBe(0)
    expect(received.products[0].stock).toBe(12.5)
    expect(sold.products[0].stock).toBe(10)
    expect(sold.sales[0].total).toBe(7)
    expect(sold.sales[0].items[0]).toEqual({ productId: 'rice', name: 'Rice', unit: 'kg', quantity: 2.5, price: 2.8, cost: 1.7 })
    expect(sold.movements.map(movement => movement.type)).toEqual(['sold', 'received'])
    expect(sold.movements[0].reference).toBe(sold.sales[0].number)
    const edited = { ...sold, products: sold.products.map(product => ({ ...product, name: 'New rice', price: 10, cost: 9 })) }
    expect(edited.sales[0].items[0].name).toBe('Rice')
    expect(edited.sales[0].items[0].cost).toBe(1.7)
    expect(edited.sales[0].total).toBe(7)
  })

  it('rejects overselling across duplicate lines without changing stock or history', () => {
    const store = receiveStock(fixture(), { productId: 'rice', quantity: 10 })
    const before = JSON.stringify(store)
    expect(() => recordSale(store, { customerId: 'customer', items: [
      { productId: 'rice', quantity: 6, price: 3 }, { productId: 'rice', quantity: 5, price: 2.5 },
    ] })).toThrow(/Not enough stock/)
    expect(JSON.stringify(store)).toBe(before)
  })

  it('combines duplicate quantities for stock while preserving separate agreed prices', () => {
    const store = receiveStock(fixture(), { productId: 'rice', quantity: 10 })
    const result = recordSale(store, { customerId: 'customer', items: [
      { productId: 'rice', quantity: 4, price: 3 }, { productId: 'rice', quantity: 6, price: 2.5 },
    ] })
    expect(result.products[0].stock).toBe(0)
    expect(result.sales[0].total).toBe(27)
    expect(result.sales[0].items).toHaveLength(2)
    expect(result.movements[0].quantity).toBe(10)
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid quantity %s for receipts and sales', quantity => {
    const store = receiveStock(fixture(), { productId: 'rice', quantity: 10 })
    expect(() => receiveStock(store, { productId: 'rice', quantity })).toThrow(/Quantity/)
    expect(() => recordSale(store, { customerId: 'customer', items: [{ productId: 'rice', quantity, price: 3 }] })).toThrow(/Quantity/)
  })

  it.each([-1, NaN, Infinity])('rejects invalid prices and costs %s', value => {
    const store = receiveStock(fixture(), { productId: 'rice', quantity: 10 })
    expect(() => receiveStock(store, { productId: 'rice', quantity: 1, cost: value })).toThrow(/Cost price/)
    expect(() => recordSale(store, { customerId: 'customer', items: [{ productId: 'rice', quantity: 1, price: value }] })).toThrow(/Selling price/)
  })

  it.each(['bottle', 'bottles', 'case', 'cases', 'bag', 'box', 'piece'])('enforces whole units for %s', unit => {
    const store = fixture()
    store.products[0] = { ...store.products[0], unit, stock: 10 }
    expect(() => receiveStock(store, { productId: 'rice', quantity: 0.5 })).toThrow(/whole number/)
    expect(() => recordSale(store, { customerId: 'customer', items: [{ productId: 'rice', quantity: 0.5, price: 3 }] })).toThrow(/whole number/)
  })

  it('supports custom units and zero-priced items without inventing conversions', () => {
    const store = fixture()
    store.products[0].unit = 'litre'
    const received = receiveStock(store, { productId: 'rice', quantity: 2.75, cost: 0 })
    const result = recordSale(received, { customerId: 'customer', items: [{ productId: 'rice', quantity: 0.75, price: 0 }] })
    expect(result.products[0].stock).toBe(2)
    expect(result.sales[0].total).toBe(0)
    expect(result.sales[0].items[0].unit).toBe('litre')
  })

  it('retains the current cost when a receipt omits the optional cost', () => {
    const original = fixture()
    const result = receiveStock(original, { productId: 'rice', quantity: 1 })
    expect(result.products[0].cost).toBe(1.5)
    expect(original.products[0].stock).toBe(0)
  })

  it('requires a valid customer, product, nonempty order, and names', () => {
    const store = fixture()
    expect(() => recordSale(store, { customerId: 'missing', items: [] })).toThrow(/customer/)
    expect(() => recordSale(store, { customerId: 'customer', items: [] })).toThrow(/at least one product/)
    expect(() => receiveStock(store, { productId: 'missing', quantity: 1 })).toThrow(/product/)
    expect(() => recordSale(store, { customerId: 'customer', items: [{ productId: 'missing', quantity: 1, price: 1 }] })).toThrow(/no longer exists/)
    store.customers[0].name = ' '
    expect(() => recordSale(store, { customerId: 'customer', items: [] })).toThrow(/Customer name/)
    store.products[0].name = ''
    expect(() => receiveStock(store, { productId: 'rice', quantity: 1 })).toThrow(/Product name/)
  })

  it('handles decimal arithmetic and unique sequential sale numbers', () => {
    let store = receiveStock(fixture(), { productId: 'rice', quantity: 0.3 })
    store = recordSale(store, { customerId: 'customer', items: [{ productId: 'rice', quantity: 0.1, price: 3 }] })
    store = recordSale(store, { customerId: 'customer', items: [{ productId: 'rice', quantity: 0.2, price: 3 }] })
    expect(store.products[0].stock).toBe(0)
    expect(store.sales.map(sale => sale.number)).toEqual(['SO-1002', 'SO-1001'])
    expect(store.sales[0].total).toBe(0.6)
  })

  it('adds rounded line totals so order totals match the amounts displayed on each line', () => {
    const store = receiveStock(fixture(), { productId: 'rice', quantity: 10 })
    const sold = recordSale(store, { customerId: 'customer', items: [
      { productId: 'rice', quantity: 2.5, price: 2.95 },
      { productId: 'rice', quantity: 2.5, price: 2.95 },
    ] })
    expect(sold.sales[0].total).toBe(14.76)
  })

  it('survives a JSON persistence round trip without losing its records', () => {
    const store = createSeed()
    const restored: Store = JSON.parse(JSON.stringify(store))
    expect(restored).toEqual(store)
    expect(restored.customers.length).toBeGreaterThan(0)
    expect(restored.sales.length).toBeGreaterThan(0)
    expect(restored.products.every(product => product.stock >= 0)).toBe(true)
    for (const product of restored.products) {
      const balance = restored.movements.filter(movement => movement.productId === product.id)
        .reduce((sum, movement) => sum + (movement.type === 'received' ? movement.quantity : -movement.quantity), 0)
      expect(balance).toBeCloseTo(product.stock)
    }
  })

  it('formats the selected currency', () => {
    expect(formatMoney(12.5, 'EUR')).toContain('12.50')
    expect(formatMoney(12.5, 'EUR')).toContain('€')
    expect(formatMoney(12.5, 'USD')).toContain('$')
  })
})
