// ============================================================
// Expense constants — pure data, safe to import in client components
// ============================================================
// No database imports. Safe for both server and client bundles.

// ============================================================
// Currencies
// ============================================================

export const CURRENCIES = [
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'IDR', label: 'IDR — Indonesian Rupiah' },
  { code: 'KRW', label: 'KRW — South Korean Won' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { code: 'VND', label: 'VND — Vietnamese Dong' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit' },
  { code: 'THB', label: 'THB — Thai Baht' },
  { code: 'PHP', label: 'PHP — Philippine Peso' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'CNY', label: 'CNY — Chinese Yuan' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']
export const CURRENCY_CODES = CURRENCIES.map(c => c.code)

// ============================================================
// Categories
// ============================================================

export const EXPENSE_CATEGORIES = [
  { value: 'LOCAL_TRANSPORT', label: 'Local Transport' },
  { value: 'SUBSCRIPTIONS', label: 'Subscriptions' },
  { value: 'OFFICE_EXPENSES', label: 'Office Expenses' },
  { value: 'MEALS_ENTERTAINMENT', label: 'Meals & Entertainment' },
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'TRAVEL', label: 'Travel' },
  { value: 'TRAINING', label: 'Training' },
  { value: 'OTHERS', label: 'Others' },
] as const

// ============================================================
// formatCurrency
// ============================================================

export function formatCurrency(amount: number | string, currency: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  }).format(num)
}
