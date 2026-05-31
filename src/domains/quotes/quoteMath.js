export const TAX_RATES = {
  AB: 5,
  BC: 12,
  MB: 12,
  NB: 15,
  NL: 15,
  NT: 5,
  NS: 15,
  NU: 5,
  ON: 13,
  PE: 15,
  QC: 14.975,
  SK: 11,
  YT: 5,
};

export const PROJECT_STATUSES = ['open', 'approved', 'ongoing', 'completed', 'invoiced'];

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateQuoteItem(item) {
  const quantity = toNumber(item.quantity);
  const pricePerUnit = toNumber(item.pricePerUnit);
  const markupRate = toNumber(item.markupRate);
  const baseTotal = quantity * pricePerUnit;
  const markupAmount = baseTotal * (markupRate / 100);

  return {
    baseTotal,
    markupAmount,
    total: baseTotal + markupAmount,
  };
}

export function calculateQuoteTotals(items = [], taxRate = 0) {
  const itemTotals = items.map(calculateQuoteItem);
  const subtotal = itemTotals.reduce((sum, item) => sum + item.baseTotal, 0);
  const markup = itemTotals.reduce((sum, item) => sum + item.markupAmount, 0);
  const taxableAmount = subtotal + markup;
  const tax = taxableAmount * (toNumber(taxRate) / 100);

  return {
    subtotal,
    markup,
    taxableAmount,
    tax,
    total: taxableAmount + tax,
  };
}

export function formatMoney(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(toNumber(value));
}

export function formatQuoteNumber(sequence, status = 'open', invoicePart = 1) {
  const base = String(sequence || 1).padStart(5, '0');

  if (status === 'open') return `Q${base}`;
  if (status === 'invoiced') return invoicePart > 1 ? `${base}-INV-${invoicePart}` : `${base}-INV`;
  return base;
}

export function deriveProjectState(quote, tasks = [], today = new Date().toISOString().slice(0, 10)) {
  if (quote.status !== 'approved' && quote.status !== 'ongoing') return quote.status;
  if (quote.status === 'approved' && quote.startDate && quote.startDate > today) return 'waiting to start';

  const hasLateTask = tasks.some((task) => !task.completedAt && task.endDate && task.endDate < today);
  if (hasLateTask) return 'delayed';
  return quote.status === 'approved' ? 'ready' : 'on time';
}
