export type Unit = string

export interface Product {
  id: string
  name: string
  sku: string
  category: string
  unit: Unit
  price: number
  cost: number
  stock: number
  reorderLevel: number
  color: string
}

export interface Customer {
  id: string
  name: string
  contact: string
  email: string
  phone: string
  address: string
}

export interface SaleItem {
  productId: string
  name: string
  unit: Unit
  quantity: number
  price: number
  cost: number
}

export interface Sale {
  id: string
  number: string
  customerId: string
  customerName: string
  items: SaleItem[]
  total: number
  date: string
}

export interface Movement {
  id: string
  productId: string
  productName: string
  quantity: number
  unit: Unit
  type: 'received' | 'sold'
  date: string
  reference: string
}

export interface Store {
  products: Product[]
  customers: Customer[]
  sales: Sale[]
  movements: Movement[]
  currency: string
}

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function formatMoney(value: number, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase()
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency', currency: normalizedCurrency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${normalizedCurrency}`.trim()
  }
}

function requireName(value: string, label: string): void {
  if (!value?.trim()) throw new Error(`${label} is required.`)
}

function requireNonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a valid number of zero or more.`)
}

export function isCountUnit(unit: Unit): boolean {
  return /^(bottles?|cases?|bags?|box|boxes|pieces?)$/i.test(unit.trim())
}

function requireQuantity(value: number, unit: Unit): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Quantity must be greater than zero.')
  if (isCountUnit(unit) && !Number.isInteger(value)) {
    throw new Error(`Quantity for ${unit} must be a whole number.`)
  }
}

function validateProduct(product: Product): void {
  requireName(product.name, 'Product name')
  requireName(product.unit, 'Product unit')
  requireNonnegative(product.stock, 'Available stock')
  requireNonnegative(product.cost, 'Cost price')
}

const roundStock = (value: number) => Math.round(value * 1_000_000) / 1_000_000

export function recordSale(
  store: Store,
  input: { customerId: string; items: { productId: string; quantity: number; price: number }[] },
): Store {
  const customer = store.customers.find(candidate => candidate.id === input.customerId)
  if (!customer) throw new Error('Choose a valid customer.')
  requireName(customer.name, 'Customer name')
  if (!input.items.length) throw new Error('Add at least one product to the sale.')

  const quantities = new Map<string, number>()
  const items: SaleItem[] = input.items.map(line => {
    const product = store.products.find(candidate => candidate.id === line.productId)
    if (!product) throw new Error('A selected product no longer exists.')
    validateProduct(product)
    requireQuantity(line.quantity, product.unit)
    requireNonnegative(line.price, 'Selling price')
    quantities.set(product.id, roundStock((quantities.get(product.id) ?? 0) + line.quantity))
    return {
      productId: product.id, name: product.name, unit: product.unit,
      quantity: line.quantity, price: line.price, cost: product.cost,
    }
  })

  for (const [productId, quantity] of quantities) {
    const product = store.products.find(candidate => candidate.id === productId)!
    if (quantity > product.stock) {
      throw new Error(`Not enough stock for ${product.name}. Only ${product.stock} ${product.unit} available.`)
    }
  }

  const total = items.reduce((sum, line) => sum + Math.round((line.quantity * line.price + Number.EPSILON) * 100), 0) / 100
  if (!Number.isFinite(total)) throw new Error('The sale total is too large.')
  const date = new Date().toISOString()
  const nextNumber = Math.max(1000, ...store.sales.map(sale => Number(sale.number.replace(/^SO-/, '')) || 1000)) + 1
  const sale: Sale = {
    id: uid(), number: `SO-${nextNumber}`, customerId: customer.id,
    customerName: customer.name, items, total, date,
  }
  const movements: Movement[] = [...quantities].map(([productId, quantity]) => {
    const product = store.products.find(candidate => candidate.id === productId)!
    return {
      id: uid(), productId, productName: product.name, quantity, unit: product.unit,
      type: 'sold', date, reference: sale.number,
    }
  })
  return {
    ...store,
    products: store.products.map(product => quantities.has(product.id)
      ? { ...product, stock: roundStock(product.stock - quantities.get(product.id)!) }
      : product),
    sales: [sale, ...store.sales],
    movements: [...movements, ...store.movements],
  }
}

export function receiveStock(
  store: Store,
  input: { productId: string; quantity: number; cost?: number },
): Store {
  const product = store.products.find(candidate => candidate.id === input.productId)
  if (!product) throw new Error('Choose a valid product.')
  validateProduct(product)
  requireQuantity(input.quantity, product.unit)
  if (input.cost !== undefined) requireNonnegative(input.cost, 'Cost price')
  const stock = roundStock(product.stock + input.quantity)
  if (!Number.isFinite(stock)) throw new Error('The stock quantity is too large.')
  const movement: Movement = {
    id: uid(), productId: product.id, productName: product.name,
    quantity: input.quantity, unit: product.unit, type: 'received',
    date: new Date().toISOString(), reference: 'Stock receipt',
  }
  return {
    ...store,
    products: store.products.map(candidate => candidate.id === product.id
      ? { ...candidate, stock, cost: input.cost ?? candidate.cost }
      : candidate),
    movements: [movement, ...store.movements],
  }
}

export function createSeed(): Store {
  const products: Product[] = [
    { id: 'p1', name: 'San Pellegrino Sparkling Water', sku: 'DRK-001', category: 'Drinks', unit: 'case', price: 18.5, cost: 12.2, stock: 86, reorderLevel: 20, color: 'sage' },
    { id: 'p2', name: 'Coca-Cola Original', sku: 'DRK-002', category: 'Drinks', unit: 'case', price: 22, cost: 15.5, stock: 64, reorderLevel: 15, color: 'rose' },
    { id: 'p3', name: 'Extra Virgin Olive Oil', sku: 'OIL-001', category: 'Oils & sauces', unit: 'bottle', price: 14.8, cost: 9.5, stock: 48, reorderLevel: 12, color: 'olive' },
    { id: 'p4', name: 'Italian Chopped Tomatoes', sku: 'PAN-001', category: 'Pantry', unit: 'case', price: 16.4, cost: 10.8, stock: 8, reorderLevel: 12, color: 'terracotta' },
    { id: 'p5', name: 'Basmati Rice', sku: 'GRN-001', category: 'Grains & pasta', unit: 'kg', price: 3.2, cost: 2.05, stock: 185, reorderLevel: 40, color: 'sand' },
    { id: 'p6', name: 'Penne Rigate Pasta', sku: 'GRN-002', category: 'Grains & pasta', unit: 'kg', price: 2.9, cost: 1.7, stock: 120, reorderLevel: 30, color: 'amber' },
    { id: 'p7', name: 'All-Purpose Flour', sku: 'BAK-001', category: 'Baking', unit: 'kg', price: 1.8, cost: 1.05, stock: 22, reorderLevel: 30, color: 'sand' },
    { id: 'p8', name: 'Organic Apple Juice', sku: 'DRK-003', category: 'Drinks', unit: 'case', price: 24, cost: 16.4, stock: 32, reorderLevel: 10, color: 'amber' },
    { id: 'p9', name: 'Sea Salt', sku: 'PAN-002', category: 'Pantry', unit: 'kg', price: 2.1, cost: 1.15, stock: 45, reorderLevel: 10, color: 'blue' },
    { id: 'p10', name: 'Sunflower Oil', sku: 'OIL-002', category: 'Oils & sauces', unit: 'bottle', price: 6.5, cost: 4.1, stock: 9, reorderLevel: 15, color: 'amber' },
    { id: 'p11', name: 'Black Pepper', sku: 'PAN-003', category: 'Pantry', unit: 'kg', price: 12.8, cost: 8.2, stock: 18, reorderLevel: 5, color: 'slate' },
    { id: 'p12', name: 'Oat Milk', sku: 'DRK-004', category: 'Drinks', unit: 'case', price: 19.2, cost: 13.3, stock: 41, reorderLevel: 12, color: 'sand' },
  ]
  const customers: Customer[] = [
    { id: 'c1', name: 'The Olive Kitchen', contact: 'Sofia Martin', email: 'orders@olivekitchen.example', phone: '+49 30 555 0101', address: 'Lindenstraße 24, Berlin' },
    { id: 'c2', name: 'Bistro & Co.', contact: 'James Wilson', email: 'hello@bistroandco.example', phone: '+49 30 555 0102', address: 'Kantstraße 62, Berlin' },
    { id: 'c3', name: 'Casa di Pasta', contact: 'Marco Rossi', email: 'orders@casadipasta.example', phone: '+49 30 555 0103', address: 'Torstraße 18, Berlin' },
    { id: 'c4', name: 'Green Table', contact: 'Emma Fischer', email: 'hello@greentable.example', phone: '+49 30 555 0104', address: 'Bergstraße 9, Berlin' },
    { id: 'c5', name: 'Morning Brew Café', contact: 'Alex Chen', email: 'orders@morningbrew.example', phone: '+49 30 555 0105', address: 'Rosenthaler Straße 35, Berlin' },
    { id: 'c6', name: 'The Corner Grill', contact: 'Daniel Weber', email: 'hello@cornergrill.example', phone: '+49 30 555 0106', address: 'Danziger Straße 77, Berlin' },
  ]
  const daysAgo = (days: number, hour = 10) => {
    const date = new Date()
    date.setDate(date.getDate() - days)
    date.setHours(hour, 15, 0, 0)
    return date.toISOString()
  }
  let store: Store = { products, customers, sales: [], movements: [], currency: 'EUR' }
  store.movements = products.map(product => ({
    id: uid(), productId: product.id, productName: product.name, quantity: product.stock,
    unit: product.unit, type: 'received', date: daysAgo(12), reference: 'Opening stock',
  }))
  const orders = [
    { days: 9, customerId: 'c1', items: [{ productId: 'p1', quantity: 6, price: 18.5 }, { productId: 'p5', quantity: 20, price: 3.2 }] },
    { days: 7, customerId: 'c3', items: [{ productId: 'p6', quantity: 25, price: 2.9 }, { productId: 'p3', quantity: 8, price: 14.8 }] },
    { days: 4, customerId: 'c2', items: [{ productId: 'p2', quantity: 5, price: 22 }, { productId: 'p9', quantity: 5, price: 2.1 }] },
    { days: 2, customerId: 'c4', items: [{ productId: 'p5', quantity: 12.5, price: 3.2 }, { productId: 'p3', quantity: 4, price: 14.8 }] },
    { days: 1, customerId: 'c5', items: [{ productId: 'p12', quantity: 8, price: 19.2 }, { productId: 'p8', quantity: 3, price: 24 }] },
    { days: 0, customerId: 'c1', items: [{ productId: 'p1', quantity: 10, price: 18.5 }, { productId: 'p6', quantity: 15, price: 2.9 }, { productId: 'p3', quantity: 6, price: 14.8 }] },
  ]
  for (const order of orders) {
    store = recordSale(store, order)
    const sale = store.sales[0]
    sale.date = daysAgo(order.days)
    store.movements = store.movements.map(movement => movement.reference === sale.number
      ? { ...movement, date: sale.date } : movement)
  }
  return store
}
