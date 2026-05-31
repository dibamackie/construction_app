import { TAX_RATES, formatQuoteNumber } from '../domains/quotes/quoteMath';

const STORAGE_KEY = 'buildquote.appState.v1';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function stamp(record) {
  const now = new Date().toISOString();
  return { ...record, createdAt: record.createdAt || now, updatedAt: now };
}

export const emptyQuoteItem = (overrides = {}) => ({
  itemId: crypto.randomUUID(),
  name: '',
  roomId: '',
  roomName: '',
  roomTemplateId: '',
  quantity: 1,
  duration: 1,
  unit: 'each',
  category: 'Labor',
  pricePerUnit: 0,
  markupRate: 20,
  ...overrides,
});

const bathroomItems = [
  ['Bathroom demolition', 'Labor', 'each', 1, 2, 850],
  ['Floor tile installation', 'Labor', 'sq ft', 80, 3, 12],
  ['Wall prep and paint', 'Labor', 'sq ft', 220, 2, 3.5],
  ['Baseboard installation', 'Labor', 'linear ft', 40, 1, 7],
  ['Vanity installation', 'Labor', 'each', 1, 1, 350],
  ['Toilet installation', 'Labor', 'each', 1, 1, 250],
  ['Shower installation', 'Labor', 'each', 1, 2, 900],
  ['Interior door installation', 'Labor', 'each', 1, 1, 325],
];

const kitchenItems = [
  ['Kitchen demolition', 'Labor', 'each', 1, 2, 1100],
  ['Flooring installation', 'Labor', 'sq ft', 160, 3, 9],
  ['Painting', 'Labor', 'sq ft', 420, 2, 2.8],
  ['Cabinet installation', 'Labor', 'linear ft', 24, 3, 115],
  ['Appliance installation', 'Labor', 'each', 4, 1, 180],
  ['Sink installation', 'Labor', 'each', 1, 1, 325],
  ['Backsplash installation', 'Labor', 'sq ft', 36, 2, 18],
];

export function createInitialState() {
  const customerId = crypto.randomUUID();
  const contractorId = crypto.randomUUID();
  const quoteId = crypto.randomUUID();
  const sequence = 1;

  return {
    settings: {
      themeMode: 'system',
      companyName: 'BuildQuote',
      companyType: 'General contractor / renovation company',
      province: 'ON',
      taxRate: TAX_RATES.ON,
      validForDays: 14,
      expiryEnabled: true,
      expiryAmount: 6,
      expiryUnit: 'months',
    },
    sequence: { nextQuote: 2 },
    customers: [
      stamp({
        id: customerId,
        customerName: 'Avery Smith',
        companyName: '',
        phone: '416-555-0144',
        email: 'avery@example.com',
        address: '24 King Street',
        unitNumber: '',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M5V 1A1',
        notes: 'Prefers email updates.',
      }),
    ],
    contractors: [
      stamp({
        id: contractorId,
        companyName: 'Northline Tile Co.',
        contactName: 'Jordan Lee',
        trade: 'Flooring, Tile',
        status: 'active',
        lastAssignedJobDate: '',
        phone: '647-555-0188',
        email: 'jordan@northline.example',
        rate: 650,
        rateType: 'day',
        address: '',
        unitNumber: '',
        city: 'Toronto',
        province: 'ON',
        postalCode: '',
        notes: '',
      }),
    ],
    priceList: [
      stamp({ id: crypto.randomUUID(), name: 'Bathroom demolition', unit: 'each', pricePerUnit: 850, duration: 2, category: 'Labor' }),
      stamp({ id: crypto.randomUUID(), name: 'Floor tile installation', unit: 'sq ft', pricePerUnit: 12, duration: 3, category: 'Labor' }),
      stamp({ id: crypto.randomUUID(), name: 'Toilet', unit: 'each', pricePerUnit: 275, duration: 0, category: 'Material' }),
      stamp({ id: crypto.randomUUID(), name: 'Cabinet installation', unit: 'linear ft', pricePerUnit: 115, duration: 3, category: 'Labor' }),
    ],
    roomTemplates: [
      stamp({
        id: 'builtin-bathroom',
        name: 'Bathroom remodel',
        builtIn: true,
        items: bathroomItems.map(([name, category, unit, quantity, duration, pricePerUnit]) => emptyQuoteItem({ name, category, unit, quantity, duration, pricePerUnit })),
      }),
      stamp({
        id: 'builtin-kitchen',
        name: 'Kitchen remodel',
        builtIn: true,
        items: kitchenItems.map(([name, category, unit, quantity, duration, pricePerUnit]) => emptyQuoteItem({ name, category, unit, quantity, duration, pricePerUnit })),
      }),
    ],
    quotes: [
      stamp({
        id: quoteId,
        sequence,
        quoteNumber: formatQuoteNumber(sequence, 'open'),
        status: 'open',
        title: 'Sample bathroom refresh',
        customerId,
        projectAddress: '24 King Street, Toronto, ON',
        quoteDate: today(),
        startDate: '',
        taxRate: TAX_RATES.ON,
        invoicePart: 1,
        items: [
          emptyQuoteItem({ name: 'Bathroom demolition', roomName: 'Main bath', category: 'Labor', quantity: 1, duration: 2, pricePerUnit: 850, markupRate: 20 }),
          emptyQuoteItem({ name: 'Toilet installation', roomName: 'Main bath', category: 'Labor', quantity: 1, duration: 1, pricePerUnit: 250, markupRate: 20 }),
        ],
      }),
    ],
    schedules: [],
  };
}

export function loadAppState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createInitialState();
    return { ...createInitialState(), ...JSON.parse(saved) };
  } catch {
    return createInitialState();
  }
}

export function saveAppState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function touch(record) {
  return stamp(record);
}
