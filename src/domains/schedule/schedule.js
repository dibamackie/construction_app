const TRADE_RULES = [
  ['Demolition', ['demo', 'demolition', 'remove', 'tear out']],
  ['Electrical', ['wire', 'outlet', 'light', 'panel']],
  ['Plumbing', ['pipe', 'drain', 'toilet', 'sink', 'faucet', 'shower', 'tub']],
  ['HVAC', ['duct', 'vent', 'furnace', 'ac']],
  ['Framing', ['frame', 'stud', 'structure']],
  ['Drywall', ['drywall', 'board', 'tape', 'mud']],
  ['Painting', ['paint', 'primer']],
  ['Flooring', ['floor', 'tile', 'vinyl', 'laminate', 'hardwood']],
  ['Carpentry', ['trim', 'baseboard', 'door', 'cabinet', 'vanity']],
  ['Masonry', ['brick', 'block', 'concrete']],
  ['Roofing', ['roof', 'shingle']],
  ['Delivery', ['delivery', 'pickup', 'bin']],
  ['General Labour', ['clean', 'cleanup', 'prep']],
];

function parseDate(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function nextBusinessDay(date) {
  const next = new Date(date);
  do {
    next.setDate(next.getDate() + 1);
  } while (isWeekend(next));
  return next;
}

function normalizeBusinessStart(date) {
  let current = parseDate(date);
  while (isWeekend(current)) current = nextBusinessDay(current);
  return current;
}

export function addBusinessDays(startDate, duration) {
  let remaining = Math.max(1, Number(duration) || 1);
  let current = normalizeBusinessStart(startDate);

  while (remaining > 1) {
    current = nextBusinessDay(current);
    remaining -= 1;
  }

  return formatDate(current);
}

export function suggestTrade(item) {
  const haystack = `${item.name || ''} ${item.category || ''}`.toLowerCase();
  const match = TRADE_RULES.find(([, needles]) => needles.some((needle) => haystack.includes(needle)));
  return match?.[0] || 'General Labour';
}

export function generateScheduleFromQuote(quote, existingTasks = []) {
  const items = (quote.items || []).filter((item) => String(item.name || '').trim());
  let cursor = normalizeBusinessStart(quote.startDate || new Date().toISOString().slice(0, 10));

  return items.map((item, index) => {
    const existing = existingTasks.find((task) => task.quoteItemId === item.itemId);
    const duration = Math.max(1, Number(existing?.duration ?? item.duration) || 1);
    const startDate = index === 0 ? formatDate(cursor) : formatDate(cursor);
    const endDate = addBusinessDays(startDate, duration);
    cursor = nextBusinessDay(parseDate(endDate));

    return {
      id: existing?.id || crypto.randomUUID(),
      quoteId: quote.id,
      quoteItemId: item.itemId,
      name: item.name,
      duration,
      startDate,
      endDate,
      suggestedTrade: existing?.suggestedTrade || suggestTrade(item),
      assignedContractorId: existing?.assignedContractorId || '',
      assignedContractorName: existing?.assignedContractorName || '',
      assignedContractorTrade: existing?.assignedContractorTrade || '',
      status: existing?.status || 'not started',
      completedAt: existing?.completedAt || '',
    };
  });
}

function overlaps(a, b) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function assignContractors(tasks, contractors, allTasks = []) {
  const activeContractors = contractors.filter((contractor) => contractor.status !== 'inactive');

  return tasks.map((task) => {
    const current = activeContractors.find((contractor) => contractor.id === task.assignedContractorId);
    const currentHasConflict = current && allTasks.some((other) => (
      other.id !== task.id
      && other.assignedContractorId === current.id
      && overlaps(task, other)
    ));

    if (current && !currentHasConflict) return task;

    const available = activeContractors.find((contractor) => {
      const tradeMatch = String(contractor.trade || '').toLowerCase().includes(String(task.suggestedTrade || '').toLowerCase());
      const hasConflict = allTasks.some((other) => (
        other.id !== task.id
        && other.assignedContractorId === contractor.id
        && overlaps(task, other)
      ));
      return tradeMatch && !hasConflict;
    });

    if (!available) return task;

    return {
      ...task,
      assignedContractorId: available.id,
      assignedContractorName: available.companyName || available.contactName || 'Contractor',
      assignedContractorTrade: available.trade || '',
    };
  });
}

export function completionLabel(task) {
  if (!task.completedAt) return task.status || 'not started';
  if (task.completedAt < task.endDate) return 'early';
  if (task.completedAt === task.endDate) return 'on-time';
  return 'delayed';
}
