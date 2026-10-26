import { isCountUnit } from './model'
import type { Store } from './model'

export interface Workspace {
  store: Store
  demo: boolean
}

function invalid(reason: string): never {
  throw new Error(`This is not a valid Stockroom backup: ${reason}. No data was changed.`)
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be a record`)
  return value as Record<string, unknown>
}

function text(record: Record<string, unknown>, key: string, label: string, allowEmpty = false): string {
  const value = record[key]
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) invalid(`${label} has an invalid ${key}`)
  return value
}

function number(record: Record<string, unknown>, key: string, label: string, positive = false): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) {
    invalid(`${label} has an invalid ${key}`)
  }
  return value
}

function date(record: Record<string, unknown>, label: string): void {
  const value = text(record, 'date', label)
  if (!Number.isFinite(Date.parse(value))) invalid(`${label} has an invalid date`)
}

function records(record: Record<string, unknown>, key: string, label: string): Record<string, unknown>[] {
  const value = record[key]
  if (!Array.isArray(value)) invalid(`${label} must be a list`)
  return value.map(entry => object(entry, label))
}

function uniqueText(record: Record<string, unknown>, key: string, label: string, seen: Set<string>): void {
  const value = text(record, key, label)
  if (seen.has(value)) invalid(`${label} contains duplicate ${key} values`)
  seen.add(value)
}

function quantityForUnit(quantity: number, unit: string, label: string): void {
  if (isCountUnit(unit) && !Number.isInteger(quantity)) invalid(`${label} must use whole quantities for ${unit}`)
}

/** Validate both restored backups and existing browser state before any record reaches the UI. */
export function parseWorkspace(raw: string): Workspace {
  let parsed: unknown
  try { parsed = JSON.parse(raw) }
  catch { throw new Error('This file is not valid JSON. Choose a Stockroom backup. No data was changed.') }
  const workspace = object(parsed, 'Workspace')
  if (workspace.version !== 1) invalid('the workspace version is unsupported')
  if (typeof workspace.demo !== 'boolean') invalid('the sample workspace flag is missing or invalid')
  const store = object(workspace.store, 'Workspace data')
  const currency = text(store, 'currency', 'Workspace')
  if (!['EUR', 'USD', 'GBP', 'ALL', 'CHF', 'CAD', 'AUD', 'MKD'].includes(currency)) invalid('the business currency is unsupported')

  const products = records(store, 'products', 'Products')
  const customers = records(store, 'customers', 'Customers')
  const sales = records(store, 'sales', 'Sales')
  const movements = records(store, 'movements', 'Stock movements')

  const productIds = new Set<string>()
  for (const product of products) {
    uniqueText(product, 'id', 'Product', productIds)
    text(product, 'name', 'Product')
    text(product, 'sku', 'Product', true)
    text(product, 'category', 'Product')
    text(product, 'color', 'Product', true)
    const unit = text(product, 'unit', 'Product')
    number(product, 'price', 'Product')
    number(product, 'cost', 'Product')
    const stock = number(product, 'stock', 'Product')
    quantityForUnit(stock, unit, 'Product stock')
    number(product, 'reorderLevel', 'Product')
  }

  const customerIds = new Set<string>()
  for (const customer of customers) {
    uniqueText(customer, 'id', 'Customer', customerIds)
    text(customer, 'name', 'Customer')
    for (const key of ['contact', 'email', 'phone', 'address']) text(customer, key, 'Customer', true)
  }

  const saleIds = new Set<string>()
  const saleNumbers = new Set<string>()
  for (const sale of sales) {
    uniqueText(sale, 'id', 'Sale', saleIds)
    uniqueText(sale, 'number', 'Sale', saleNumbers)
    text(sale, 'customerId', 'Sale')
    text(sale, 'customerName', 'Sale')
    date(sale, 'Sale')
    const total = number(sale, 'total', 'Sale')
    const items = records(sale, 'items', 'Sale items')
    if (!items.length) invalid('a sale must contain at least one item')
    let totalCents = 0
    for (const item of items) {
      text(item, 'productId', 'Sale item')
      text(item, 'name', 'Sale item')
      const unit = text(item, 'unit', 'Sale item')
      const quantity = number(item, 'quantity', 'Sale item', true)
      quantityForUnit(quantity, unit, 'Sale item')
      const price = number(item, 'price', 'Sale item')
      number(item, 'cost', 'Sale item')
      totalCents += Math.round((quantity * price + Number.EPSILON) * 100)
    }
    if (!Number.isFinite(totalCents) || Math.abs(total - totalCents / 100) > 0.000001) {
      invalid('a sale total does not match its item amounts')
    }
  }

  const movementIds = new Set<string>()
  for (const movement of movements) {
    uniqueText(movement, 'id', 'Stock movement', movementIds)
    text(movement, 'productId', 'Stock movement')
    text(movement, 'productName', 'Stock movement')
    text(movement, 'reference', 'Stock movement')
    const unit = text(movement, 'unit', 'Stock movement')
    const quantity = number(movement, 'quantity', 'Stock movement', true)
    quantityForUnit(quantity, unit, 'Stock movement')
    if (movement.type !== 'received' && movement.type !== 'sold') invalid('a stock movement has an unsupported type')
    date(movement, 'Stock movement')
  }

  return { store: store as unknown as Store, demo: workspace.demo }
}
