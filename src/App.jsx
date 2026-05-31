import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Contact,
  Download,
  FileText,
  Hammer,
  Home,
  Lock,
  LogIn,
  Package,
  Plus,
  Printer,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { createInitialState, emptyQuoteItem, loadAppState, saveAppState, touch } from './data/appStorage';
import {
  PROJECT_STATUSES,
  TAX_RATES,
  calculateQuoteItem,
  calculateQuoteTotals,
  deriveProjectState,
  formatMoney,
  formatQuoteNumber,
} from './domains/quotes/quoteMath';
import { assignContractors, completionLabel, generateScheduleFromQuote } from './domains/schedule/schedule';
import { inferMaterials } from './domains/takeoff/takeoff';
import './App.css';

const navItems = [
  ['dashboard', Home, 'Dashboard'],
  ['quotes', FileText, 'Quotes'],
  ['schedule', CalendarDays, 'Schedule'],
  ['pricing', ClipboardList, 'Price List'],
  ['templates', Package, 'Room Templates'],
  ['contractors', Hammer, 'Contractors'],
  ['customers', Users, 'Customers'],
  ['takeoff', Wrench, 'Material Takeoff'],
  ['analysis', BarChart3, 'Analysis'],
  ['settings', Settings, 'Settings'],
];

const companyTypes = [
  'General contractor / renovation company',
  'Plumbing',
  'Electrical',
  'HVAC',
  'Roofing',
  'Drywall/taping',
  'Painting',
  'Flooring',
  'Tile',
  'Framing/carpentry',
  'Finish carpentry',
  'Concrete',
  'Landscaping',
  'Masonry',
  'Excavation/sitework',
  'Demolition',
  'Window/door',
  'Cabinet/kitchen',
  'Insulation',
  'Handy person/property maintenance',
  'Cleaning/post-construction cleaning',
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function displayCustomer(customer) {
  return customer?.customerName || customer?.companyName || 'Customer';
}

function makeCustomer() {
  return {
    id: crypto.randomUUID(),
    customerName: '',
    companyName: '',
    phone: '',
    email: '',
    address: '',
    unitNumber: '',
    city: '',
    province: 'ON',
    postalCode: '',
    notes: '',
  };
}

function makeContractor() {
  return {
    id: crypto.randomUUID(),
    companyName: '',
    contactName: '',
    trade: '',
    status: 'active',
    lastAssignedJobDate: '',
    phone: '',
    email: '',
    rate: 0,
    rateType: 'day',
    address: '',
    unitNumber: '',
    city: '',
    province: 'ON',
    postalCode: '',
    notes: '',
  };
}

function makePriceItem() {
  return { id: crypto.randomUUID(), name: '', unit: 'each', pricePerUnit: 0, duration: 1, category: 'Labor' };
}

function makeQuote(sequence, customerId = '') {
  return {
    id: crypto.randomUUID(),
    sequence,
    quoteNumber: formatQuoteNumber(sequence, 'open'),
    status: 'open',
    title: '',
    customerId,
    projectAddress: '',
    quoteDate: today(),
    startDate: '',
    taxRate: TAX_RATES.ON,
    invoicePart: 1,
    items: [emptyQuoteItem()],
  };
}

function App() {
  const [state, setState] = useState(loadAppState);
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedQuoteId, setSelectedQuoteId] = useState(state.quotes[0]?.id || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState(state.customers[0]?.id || '');
  const [selectedContractorId, setSelectedContractorId] = useState(state.contractors[0]?.id || '');
  const [selectedPriceId, setSelectedPriceId] = useState(state.priceList[0]?.id || '');
  const [notice, setNotice] = useState('');
  const [authView, setAuthView] = useState('landing');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.themeMode === 'system') {
      root.removeAttribute('data-theme');
      return;
    }
    root.dataset.theme = state.settings.themeMode;
  }, [state.settings.themeMode]);

  const selectedQuote = state.quotes.find((quote) => quote.id === selectedQuoteId) || state.quotes[0];
  const selectedCustomer = state.customers.find((customer) => customer.id === selectedCustomerId) || state.customers[0];
  const selectedContractor = state.contractors.find((contractor) => contractor.id === selectedContractorId) || state.contractors[0];
  const selectedPriceItem = state.priceList.find((item) => item.id === selectedPriceId) || state.priceList[0];

  const quoteTotals = useMemo(() => {
    const map = new Map();
    state.quotes.forEach((quote) => map.set(quote.id, calculateQuoteTotals(quote.items, quote.taxRate)));
    return map;
  }, [state.quotes]);

  function flash(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  }

  function updateCollection(collection, id, patch) {
    setState((current) => ({
      ...current,
      [collection]: current[collection].map((record) => (record.id === id ? touch({ ...record, ...patch }) : record)),
    }));
  }

  function deleteRecord(collection, id, fallbackSetter) {
    setState((current) => ({
      ...current,
      [collection]: current[collection].filter((record) => record.id !== id),
    }));
    fallbackSetter?.('');
  }

  function createQuote(customerId = '') {
    const quote = touch(makeQuote(state.sequence.nextQuote, customerId));
    setState((current) => ({
      ...current,
      sequence: { ...current.sequence, nextQuote: current.sequence.nextQuote + 1 },
      quotes: [quote, ...current.quotes],
    }));
    setSelectedQuoteId(quote.id);
    setActivePage('quotes');
  }

  function updateQuote(patch) {
    updateCollection('quotes', selectedQuote.id, {
      ...patch,
      quoteNumber: formatQuoteNumber(selectedQuote.sequence, patch.status || selectedQuote.status, patch.invoicePart || selectedQuote.invoicePart),
    });
  }

  function updateQuoteItem(itemId, patch) {
    updateCollection('quotes', selectedQuote.id, {
      items: selectedQuote.items.map((item) => (item.itemId === itemId ? { ...item, ...patch } : item)),
    });
  }

  function addQuoteItem(priceItem) {
    const item = emptyQuoteItem(priceItem ? {
      name: priceItem.name,
      unit: priceItem.unit,
      pricePerUnit: priceItem.pricePerUnit,
      duration: priceItem.duration,
      category: priceItem.category,
    } : {});
    updateQuote({ items: [...selectedQuote.items, item] });
  }

  function applyRoomTemplate(template) {
    const roomId = crypto.randomUUID();
    const items = template.items.map((templateItem) => {
      const saved = state.priceList.find((priceItem) => priceItem.name.toLowerCase() === templateItem.name.toLowerCase());
      return emptyQuoteItem({
        ...templateItem,
        itemId: crypto.randomUUID(),
        roomId,
        roomName: template.name,
        roomTemplateId: template.id,
        unit: saved?.unit || templateItem.unit,
        pricePerUnit: saved?.pricePerUnit ?? templateItem.pricePerUnit,
        duration: saved?.duration ?? templateItem.duration,
        category: saved?.category || templateItem.category,
      });
    });
    updateQuote({ items: [...selectedQuote.items, ...items] });
  }

  function approveQuote() {
    updateQuote({ status: 'approved', startDate: selectedQuote.startDate || today() });
    flash('Quote approved and ready for scheduling.');
  }

  function generateSchedule() {
    const existing = state.schedules.filter((task) => task.quoteId === selectedQuote.id);
    const generated = generateScheduleFromQuote({ ...selectedQuote, startDate: selectedQuote.startDate || today() }, existing);
    const assigned = assignContractors(generated, state.contractors, state.schedules);
    setState((current) => ({
      ...current,
      quotes: current.quotes.map((quote) => (
        quote.id === selectedQuote.id ? touch({ ...quote, status: quote.status === 'open' ? 'approved' : quote.status, startDate: quote.startDate || today() }) : quote
      )),
      schedules: [...current.schedules.filter((task) => task.quoteId !== selectedQuote.id), ...assigned],
      contractors: current.contractors.map((contractor) => {
        const wasAssigned = assigned.some((task) => task.assignedContractorId === contractor.id);
        return wasAssigned ? touch({ ...contractor, lastAssignedJobDate: today() }) : contractor;
      }),
    }));
    setActivePage('schedule');
    flash('Schedule generated from quote items.');
  }

  function updateTask(taskId, patch) {
    setState((current) => ({
      ...current,
      schedules: current.schedules.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
    }));
  }

  function printQuote() {
    window.print();
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `buildquote-backup-${today()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const dashboardStats = useMemo(() => {
    const openQuotes = state.quotes.filter((quote) => quote.status === 'open');
    const activeQuotes = state.quotes.filter((quote) => ['approved', 'ongoing'].includes(quote.status));
    const delayedQuotes = activeQuotes.filter((quote) => deriveProjectState(quote, state.schedules.filter((task) => task.quoteId === quote.id)) === 'delayed');
    const totalValue = state.quotes.reduce((sum, quote) => sum + quoteTotals.get(quote.id).total, 0);

    return {
      openQuotes,
      activeQuotes,
      delayedQuotes,
      totalValue,
    };
  }, [quoteTotals, state.quotes, state.schedules]);

  const pageProps = {
    state,
    setState,
    selectedQuote,
    selectedCustomer,
    selectedContractor,
    selectedPriceItem,
    selectedQuoteId,
    setSelectedQuoteId,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedContractorId,
    setSelectedContractorId,
    selectedPriceId,
    setSelectedPriceId,
    activePage,
    setActivePage,
    quoteTotals,
    dashboardStats,
    createQuote,
    updateCollection,
    deleteRecord,
    updateQuote,
    updateQuoteItem,
    addQuoteItem,
    applyRoomTemplate,
    approveQuote,
    generateSchedule,
    updateTask,
    printQuote,
    exportBackup,
    flash,
  };

  if (!isAuthenticated) {
    return authView === 'login' ? (
      <LoginMock
        companyName={state.settings.companyName}
        onBack={() => setAuthView('landing')}
        onLogin={() => {
          setIsAuthenticated(true);
          setActivePage('dashboard');
          flash('Signed in to local demo workspace.');
        }}
      />
    ) : (
      <LandingPage
        stats={dashboardStats}
        quoteCount={state.quotes.length}
        contractorCount={state.contractors.filter((contractor) => contractor.status !== 'inactive').length}
        onLogin={() => setAuthView('login')}
        onDemo={() => {
          setIsAuthenticated(true);
          setActivePage('dashboard');
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Hammer size={20} /></div>
          <div>
            <strong>BuildQuote</strong>
            <span>Construction command center</span>
          </div>
        </div>
        <nav className="side-nav">
          {navItems.map(([id, Icon, label]) => (
            <button key={id} className={activePage === id ? 'active' : ''} onClick={() => setActivePage(id)}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{state.settings.companyType}</p>
            <h1>{navItems.find(([id]) => id === activePage)?.[2]}</h1>
          </div>
          <div className="topbar-actions">
            {notice && <span className="notice">{notice}</span>}
            <button className="icon-button" onClick={exportBackup} title="Export backup"><Download size={18} /></button>
            <button className="primary-button" onClick={() => createQuote()}><Plus size={18} /> New quote</button>
          </div>
        </header>

        {activePage === 'dashboard' && <DashboardPage {...pageProps} />}
        {activePage === 'quotes' && <QuotesPage {...pageProps} />}
        {activePage === 'schedule' && <SchedulePage {...pageProps} />}
        {activePage === 'pricing' && <PriceListPage {...pageProps} />}
        {activePage === 'templates' && <TemplatesPage {...pageProps} />}
        {activePage === 'contractors' && <ContractorsPage {...pageProps} />}
        {activePage === 'customers' && <CustomersPage {...pageProps} />}
        {activePage === 'takeoff' && <TakeoffPage {...pageProps} />}
        {activePage === 'analysis' && <AnalysisPage {...pageProps} />}
        {activePage === 'settings' && <SettingsPage {...pageProps} />}
      </main>
    </div>
  );
}

function LandingPage({ stats, quoteCount, contractorCount, onLogin, onDemo }) {
  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <div className="brand">
          <div className="brand-mark"><Hammer size={20} /></div>
          <div>
            <strong>BuildQuote</strong>
            <span>Contractor workspace</span>
          </div>
        </div>
        <div className="marketing-actions">
          <button className="small-button" onClick={onLogin}><LogIn size={16} /> Sign in</button>
          <button className="primary-button" onClick={onDemo}>Open demo <ArrowRight size={16} /></button>
        </div>
      </header>

      <main className="marketing-hero">
        <div className="hero-media" aria-hidden="true">
          <img src="/hero.png" alt="" />
        </div>
        <section className="hero-copy">
          <span className="security-badge"><ShieldCheck size={16} /> Secure local-first quoting</span>
          <h1>BuildQuote</h1>
          <p>
            A construction command center for quotes, customers, contractors, schedules,
            reusable pricing, material takeoffs, and project health.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onDemo}>Launch workspace <ArrowRight size={16} /></button>
            <button className="small-button" onClick={onLogin}><Lock size={16} /> Security login</button>
          </div>
        </section>

        <section className="hero-dashboard" aria-label="BuildQuote preview">
          <div className="preview-top">
            <span>Today</span>
            <strong>{formatMoney(stats.totalValue)}</strong>
          </div>
          <div className="preview-grid">
            <div><span>Open quotes</span><b>{stats.openQuotes.length}</b></div>
            <div><span>Active jobs</span><b>{stats.activeQuotes.length}</b></div>
            <div><span>Contractors</span><b>{contractorCount}</b></div>
            <div><span>Records</span><b>{quoteCount}</b></div>
          </div>
          <div className="preview-flow">
            {['Quote', 'Approve', 'Schedule', 'Invoice'].map((step, index) => (
              <div key={step} className={index < 3 ? 'done' : ''}>
                <i />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <section className="marketing-modules">
        {[
          ['Quote Builder', 'Reusable pricing, room templates, markup, tax, and print-ready customer documents.'],
          ['Schedule Control', 'Business-day sequencing, trade suggestions, task completion, and delay visibility.'],
          ['CRM Records', 'Customers, contractors, contact details, notes, rates, and job relationships.'],
        ].map(([title, body]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function LoginMock({ companyName, onBack, onLogin }) {
  const [email, setEmail] = useState('owner@buildquote.local');
  const [password, setPassword] = useState('demo-password');
  const [remember, setRemember] = useState(true);

  function submit(event) {
    event.preventDefault();
    onLogin({ email, password, remember });
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <button className="back-button" onClick={onBack}>Back to landing</button>
        <div className="login-heading">
          <div className="brand-mark"><Lock size={20} /></div>
          <span>Protected workspace</span>
          <h1>{companyName}</h1>
          <p>Mock authentication screen for the security flow. Real identity, roles, and session handling can plug into this screen later.</p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <Field label="Email" type="email" value={email} onChange={setEmail} />
          <Field label="Password" type="password" value={password} onChange={setPassword} />
          <label className="check-field">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Keep this device trusted
          </label>
          <button className="primary-button" type="submit"><ShieldCheck size={17} /> Sign in securely</button>
        </form>

        <div className="security-notes">
          <div><ShieldCheck size={17} /><span>Role-ready access layer</span></div>
          <div><Lock size={17} /><span>Future session timeout controls</span></div>
          <div><FileText size={17} /><span>Audit-friendly project records</span></div>
        </div>
      </section>
    </div>
  );
}

function DashboardPage({ state, quoteTotals, dashboardStats, setActivePage, setSelectedQuoteId, createQuote }) {
  const recentQuotes = state.quotes.slice(0, 5);

  return (
    <section className="page-grid">
      <div className="stat-grid">
        <StatCard label="Open quotes" value={dashboardStats.openQuotes.length} onClick={() => setActivePage('quotes')} />
        <StatCard label="Active jobs" value={dashboardStats.activeQuotes.length} onClick={() => setActivePage('schedule')} />
        <StatCard label="Delayed jobs" value={dashboardStats.delayedQuotes.length} tone="warning" onClick={() => setActivePage('schedule')} />
        <StatCard label="Quoted value" value={formatMoney(dashboardStats.totalValue)} />
      </div>

      <div className="split-grid">
        <Panel title="Recent Quotes" action={<button className="small-button" onClick={() => createQuote()}><Plus size={15} /> New</button>}>
          <div className="record-list">
            {recentQuotes.map((quote) => (
              <button key={quote.id} className="record-row" onClick={() => { setSelectedQuoteId(quote.id); setActivePage('quotes'); }}>
                <div>
                  <strong>{quote.title || 'Untitled quote'}</strong>
                  <span>{quote.quoteNumber} · {quote.status}</span>
                </div>
                <b>{formatMoney(quoteTotals.get(quote.id).total)}</b>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Schedule Health">
          <div className="health-list">
            {dashboardStats.delayedQuotes.length === 0 ? (
              <EmptyState title="No delayed jobs" body="Active jobs are currently on track." />
            ) : dashboardStats.delayedQuotes.map((quote) => (
              <div className="health-row" key={quote.id}>
                <AlertTriangle size={18} />
                <span>{quote.title || quote.quoteNumber}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function QuotesPage(props) {
  const {
    state,
    selectedQuote,
    setSelectedQuoteId,
    quoteTotals,
    updateQuote,
    updateQuoteItem,
    addQuoteItem,
    applyRoomTemplate,
    approveQuote,
    generateSchedule,
    printQuote,
    deleteRecord,
    flash,
  } = props;

  if (!selectedQuote) return <EmptyState title="No quotes yet" body="Create a quote to start building project scope." />;

  const locked = ['completed', 'invoiced'].includes(selectedQuote.status);
  const totals = quoteTotals.get(selectedQuote.id);
  const customer = state.customers.find((item) => item.id === selectedQuote.customerId);

  return (
    <section className="quotes-layout">
      <Panel title="Quotes">
        <div className="record-list quote-list">
          {state.quotes.map((quote) => (
            <button key={quote.id} className={`record-row ${quote.id === selectedQuote.id ? 'selected' : ''}`} onClick={() => setSelectedQuoteId(quote.id)}>
              <div>
                <strong>{quote.title || 'Untitled quote'}</strong>
                <span>{quote.quoteNumber} · {quote.status}</span>
              </div>
              <b>{formatMoney(quoteTotals.get(quote.id).total)}</b>
            </button>
          ))}
        </div>
      </Panel>

      <div className="quote-editor">
        <Panel
          title={`${selectedQuote.quoteNumber} ${selectedQuote.title || ''}`}
          action={(
            <div className="button-row">
              <button className="small-button" onClick={printQuote}><Printer size={15} /> Print</button>
              {selectedQuote.status === 'open' && <button className="small-button" onClick={approveQuote}><CheckCircle2 size={15} /> Approve</button>}
              <button className="small-button" onClick={generateSchedule}><CalendarDays size={15} /> Schedule</button>
              {selectedQuote.status === 'open' && <button className="danger-button" onClick={() => { deleteRecord('quotes', selectedQuote.id, setSelectedQuoteId); flash('Open quote deleted.'); }}><Trash2 size={15} /></button>}
            </div>
          )}
        >
          {locked && <div className="lock-banner">Completed and invoiced projects are read-only.</div>}
          <div className="form-grid">
            <Field label="Project title" value={selectedQuote.title} disabled={locked} onChange={(value) => updateQuote({ title: value })} />
            <label className="field">
              Customer
              <select value={selectedQuote.customerId} disabled={locked} onChange={(event) => {
                const nextCustomer = state.customers.find((item) => item.id === event.target.value);
                updateQuote({
                  customerId: event.target.value,
                  projectAddress: nextCustomer ? [nextCustomer.address, nextCustomer.city, nextCustomer.province].filter(Boolean).join(', ') : selectedQuote.projectAddress,
                  taxRate: TAX_RATES[nextCustomer?.province] || selectedQuote.taxRate,
                });
              }}>
                <option value="">Unassigned</option>
                {state.customers.map((item) => <option key={item.id} value={item.id}>{displayCustomer(item)}</option>)}
              </select>
            </label>
            <Field label="Project address" value={selectedQuote.projectAddress} disabled={locked} onChange={(value) => updateQuote({ projectAddress: value })} />
            <Field label="Quote date" type="date" value={selectedQuote.quoteDate} disabled={locked} onChange={(value) => updateQuote({ quoteDate: value })} />
            <Field label="Start date" type="date" value={selectedQuote.startDate} disabled={locked} onChange={(value) => updateQuote({ startDate: value })} />
            <label className="field">
              Status
              <select value={selectedQuote.status} disabled={locked} onChange={(event) => updateQuote({ status: event.target.value })}>
                {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <Field label="Tax rate %" type="number" value={selectedQuote.taxRate} disabled={locked} onChange={(value) => updateQuote({ taxRate: value })} />
          </div>
        </Panel>

        <Panel title="Line Items" action={!locked && <button className="small-button" onClick={() => addQuoteItem()}><Plus size={15} /> Item</button>}>
          {!locked && (
            <div className="tool-strip">
              <label>
                Price list
                <select onChange={(event) => {
                  const priceItem = state.priceList.find((item) => item.id === event.target.value);
                  if (priceItem) addQuoteItem(priceItem);
                  event.target.value = '';
                }}>
                  <option value="">Add from price list</option>
                  {state.priceList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>
                Room template
                <select onChange={(event) => {
                  const template = state.roomTemplates.find((item) => item.id === event.target.value);
                  if (template) applyRoomTemplate(template);
                  event.target.value = '';
                }}>
                  <option value="">Apply template</option>
                  {state.roomTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="line-items">
            <div className="line-item header">
              <span>Description</span><span>Room</span><span>Qty</span><span>Unit</span><span>Cat</span><span>Price</span><span>MU%</span><span>Total</span><span></span>
            </div>
            {selectedQuote.items.map((item) => {
              const itemTotal = calculateQuoteItem(item);
              return (
                <div className="line-item" key={item.itemId}>
                  <input value={item.name} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { name: event.target.value })} />
                  <input value={item.roomName} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { roomName: event.target.value })} />
                  <input type="number" value={item.quantity} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { quantity: event.target.value })} />
                  <input value={item.unit} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { unit: event.target.value })} />
                  <select value={item.category} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { category: event.target.value })}>
                    {['Labor', 'Material', 'Equipment', 'Subcontractor', 'Other'].map((category) => <option key={category}>{category}</option>)}
                  </select>
                  <input type="number" value={item.pricePerUnit} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { pricePerUnit: event.target.value })} />
                  <input type="number" value={item.markupRate} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { markupRate: event.target.value })} />
                  <strong>{formatMoney(itemTotal.total)}</strong>
                  {!locked && <button className="icon-button" onClick={() => updateQuote({ items: selectedQuote.items.filter((candidate) => candidate.itemId !== item.itemId) })}><Trash2 size={15} /></button>}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Customer Quote Preview">
          <div className="print-document">
            <div>
              <h2>{state.settings.companyName}</h2>
              <p>{state.settings.companyType}</p>
            </div>
            <div className="doc-grid">
              <div><b>Customer</b><span>{displayCustomer(customer)}</span><span>{customer?.email}</span></div>
              <div><b>Project</b><span>{selectedQuote.projectAddress || 'No address'}</span><span>{selectedQuote.quoteNumber}</span></div>
            </div>
            <table>
              <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
              <tbody>
                {selectedQuote.items.map((item) => <tr key={item.itemId}><td>{item.name || 'Line item'}</td><td>{item.quantity}</td><td>{item.unit}</td><td>{formatMoney(calculateQuoteItem(item).total)}</td></tr>)}
              </tbody>
            </table>
            <div className="totals">
              <span>Subtotal {formatMoney(totals.subtotal)}</span>
              <span>Markup {formatMoney(totals.markup)}</span>
              <span>Tax {formatMoney(totals.tax)}</span>
              <strong>Total {formatMoney(totals.total)}</strong>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function SchedulePage({ state, setSelectedQuoteId, setActivePage, updateTask, generateSchedule }) {
  const activeTasks = state.schedules;

  return (
    <Panel title="Generated Schedules">
      {activeTasks.length === 0 ? (
        <EmptyState title="No schedule tasks yet" body="Open a quote and generate its schedule from line items." />
      ) : (
        <div className="task-board">
          {activeTasks.map((task) => {
            const quote = state.quotes.find((item) => item.id === task.quoteId);
            return (
              <div className="task-card" key={task.id}>
                <div>
                  <span className={`status-pill ${completionLabel(task).replace(' ', '-')}`}>{completionLabel(task)}</span>
                  <h3>{task.name}</h3>
                  <p>{quote?.quoteNumber} · {task.suggestedTrade}</p>
                </div>
                <div className="task-fields">
                  <Field label="Start" type="date" value={task.startDate} onChange={(value) => updateTask(task.id, { startDate: value })} />
                  <Field label="End" type="date" value={task.endDate} onChange={(value) => updateTask(task.id, { endDate: value })} />
                  <Field label="Done" type="date" value={task.completedAt} onChange={(value) => updateTask(task.id, { completedAt: value, status: value ? 'completed' : 'not started' })} />
                  <label className="field">
                    Contractor
                    <select value={task.assignedContractorId} onChange={(event) => {
                      const contractor = state.contractors.find((item) => item.id === event.target.value);
                      updateTask(task.id, {
                        assignedContractorId: contractor?.id || '',
                        assignedContractorName: contractor?.companyName || contractor?.contactName || '',
                        assignedContractorTrade: contractor?.trade || '',
                      });
                    }}>
                      <option value="">Unassigned</option>
                      {state.contractors.filter((item) => item.status !== 'inactive').map((item) => <option key={item.id} value={item.id}>{item.companyName || item.contactName} · {item.trade}</option>)}
                    </select>
                  </label>
                </div>
                <div className="button-row">
                  <button className="small-button" onClick={() => { setSelectedQuoteId(task.quoteId); setActivePage('quotes'); }}>Open quote</button>
                  <button className="small-button" onClick={generateSchedule}>Resequence selected</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function PriceListPage({ state, selectedPriceItem, setSelectedPriceId, updateCollection, setState, deleteRecord }) {
  return (
    <CrudPage
      title="Reusable Price List"
      records={state.priceList}
      selected={selectedPriceItem}
      setSelected={setSelectedPriceId}
      label={(item) => item.name || 'Untitled item'}
      detail={selectedPriceItem && (
        <div className="form-grid">
          <Field label="Name" value={selectedPriceItem.name} onChange={(value) => updateCollection('priceList', selectedPriceItem.id, { name: value })} />
          <Field label="Unit" value={selectedPriceItem.unit} onChange={(value) => updateCollection('priceList', selectedPriceItem.id, { unit: value })} />
          <Field label="Price per unit" type="number" value={selectedPriceItem.pricePerUnit} onChange={(value) => updateCollection('priceList', selectedPriceItem.id, { pricePerUnit: value })} />
          <Field label="Duration" type="number" value={selectedPriceItem.duration} onChange={(value) => updateCollection('priceList', selectedPriceItem.id, { duration: value })} />
          <label className="field">Category<select value={selectedPriceItem.category} onChange={(event) => updateCollection('priceList', selectedPriceItem.id, { category: event.target.value })}>{['Labor', 'Material', 'Equipment', 'Subcontractor', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
      )}
      onNew={() => {
        const item = touch(makePriceItem());
        setState((current) => ({ ...current, priceList: [item, ...current.priceList] }));
        setSelectedPriceId(item.id);
      }}
      onDelete={() => deleteRecord('priceList', selectedPriceItem.id, setSelectedPriceId)}
    />
  );
}

function TemplatesPage({ state, selectedQuote, setState, applyRoomTemplate }) {
  function saveCurrentAsTemplate() {
    const template = touch({
      id: crypto.randomUUID(),
      name: selectedQuote?.title ? `${selectedQuote.title} room` : 'Custom room template',
      builtIn: false,
      items: selectedQuote?.items || [],
    });
    setState((current) => ({ ...current, roomTemplates: [template, ...current.roomTemplates] }));
  }

  return (
    <Panel title="Room Templates" action={<button className="small-button" onClick={saveCurrentAsTemplate}><Save size={15} /> Save current quote</button>}>
      <div className="template-grid">
        {state.roomTemplates.map((template) => (
          <div className="template-card" key={template.id}>
            <div>
              <span className="status-pill">{template.builtIn ? 'built-in' : 'custom'}</span>
              <h3>{template.name}</h3>
              <p>{template.items.length} reusable items</p>
            </div>
            <div className="button-row">
              <button className="small-button" onClick={() => applyRoomTemplate(template)}>Apply to quote</button>
              {!template.builtIn && <button className="danger-button" onClick={() => setState((current) => ({ ...current, roomTemplates: current.roomTemplates.filter((item) => item.id !== template.id) }))}><Trash2 size={15} /></button>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ContractorsPage({ state, selectedContractor, setSelectedContractorId, updateCollection, setState, deleteRecord }) {
  return (
    <CrudPage
      title="Contractor CRM"
      records={state.contractors}
      selected={selectedContractor}
      setSelected={setSelectedContractorId}
      label={(item) => item.companyName || item.contactName || 'Contractor'}
      detail={selectedContractor && (
        <div className="form-grid">
          {['companyName', 'contactName', 'trade', 'phone', 'email', 'address', 'unitNumber', 'city', 'province', 'postalCode'].map((key) => (
            <Field key={key} label={key.replace(/([A-Z])/g, ' $1')} value={selectedContractor[key]} onChange={(value) => updateCollection('contractors', selectedContractor.id, { [key]: value })} />
          ))}
          <Field label="Rate" type="number" value={selectedContractor.rate} onChange={(value) => updateCollection('contractors', selectedContractor.id, { rate: value })} />
          <label className="field">Rate type<select value={selectedContractor.rateType} onChange={(event) => updateCollection('contractors', selectedContractor.id, { rateType: event.target.value })}>{['project', 'hour', 'day'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field">Status<select value={selectedContractor.status} onChange={(event) => updateCollection('contractors', selectedContractor.id, { status: event.target.value })}>{['active', 'inactive'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <Field label="Notes" value={selectedContractor.notes} onChange={(value) => updateCollection('contractors', selectedContractor.id, { notes: value })} />
        </div>
      )}
      onNew={() => {
        const item = touch(makeContractor());
        setState((current) => ({ ...current, contractors: [item, ...current.contractors] }));
        setSelectedContractorId(item.id);
      }}
      onDelete={() => deleteRecord('contractors', selectedContractor.id, setSelectedContractorId)}
    />
  );
}

function CustomersPage({ state, selectedCustomer, setSelectedCustomerId, updateCollection, setState, deleteRecord, createQuote, setSelectedQuoteId, setActivePage }) {
  const relatedQuotes = state.quotes.filter((quote) => quote.customerId === selectedCustomer?.id);

  return (
    <CrudPage
      title="Customer CRM"
      records={state.customers}
      selected={selectedCustomer}
      setSelected={setSelectedCustomerId}
      label={displayCustomer}
      detail={selectedCustomer && (
        <>
          <div className="form-grid">
            {['customerName', 'companyName', 'phone', 'email', 'address', 'unitNumber', 'city', 'province', 'postalCode', 'notes'].map((key) => (
              <Field key={key} label={key.replace(/([A-Z])/g, ' $1')} value={selectedCustomer[key]} onChange={(value) => updateCollection('customers', selectedCustomer.id, { [key]: value })} />
            ))}
          </div>
          <div className="section-divider">
            <div className="button-row">
              <button className="small-button" onClick={() => createQuote(selectedCustomer.id)}><Plus size={15} /> Quote for customer</button>
              <button className="small-button" onClick={() => setActivePage('quotes')}>View quotes</button>
            </div>
            <div className="record-list compact">
              {relatedQuotes.map((quote) => <button key={quote.id} className="record-row" onClick={() => { setSelectedQuoteId(quote.id); setActivePage('quotes'); }}><span>{quote.quoteNumber}</span><b>{quote.status}</b></button>)}
            </div>
          </div>
        </>
      )}
      onNew={() => {
        const item = touch(makeCustomer());
        setState((current) => ({ ...current, customers: [item, ...current.customers] }));
        setSelectedCustomerId(item.id);
      }}
      onDelete={() => deleteRecord('customers', selectedCustomer.id, setSelectedCustomerId)}
    />
  );
}

function TakeoffPage({ state }) {
  const materials = inferMaterials(state.quotes, state.priceList);

  return (
    <Panel title="Material Takeoff">
      {materials.length === 0 ? (
        <EmptyState title="No inferred materials" body="Add labor items such as sink installation or flooring installation to generate material placeholders." />
      ) : (
        <div className="data-table">
          <div className="table-row header"><span>Project</span><span>Material</span><span>Qty</span><span>Unit</span><span>Price</span><span>Reason</span></div>
          {materials.map((item) => <div className="table-row" key={item.id}><span>{item.quoteTitle}</span><span>{item.material}</span><span>{item.quantity}</span><span>{item.unit}</span><span>{formatMoney(item.pricePerUnit)}</span><span>{item.reason}</span></div>)}
        </div>
      )}
    </Panel>
  );
}

function AnalysisPage({ state, quoteTotals }) {
  const total = state.quotes.reduce((sum, quote) => sum + quoteTotals.get(quote.id).total, 0);
  const average = state.quotes.length ? total / state.quotes.length : 0;
  const statusCounts = PROJECT_STATUSES.map((status) => [status, state.quotes.filter((quote) => quote.status === status).length]);
  const categories = new Map();
  state.quotes.forEach((quote) => quote.items.forEach((item) => {
    const totalItem = calculateQuoteItem(item).total;
    categories.set(item.category, (categories.get(item.category) || 0) + totalItem);
  }));

  return (
    <section className="page-grid">
      <div className="stat-grid">
        <StatCard label="Total quote value" value={formatMoney(total)} />
        <StatCard label="Average quote" value={formatMoney(average)} />
        <StatCard label="Quotes" value={state.quotes.length} />
        <StatCard label="Scheduled tasks" value={state.schedules.length} />
      </div>
      <div className="split-grid">
        <Panel title="Quote Count By Status">{statusCounts.map(([status, count]) => <MetricBar key={status} label={status} value={count} max={Math.max(1, state.quotes.length)} />)}</Panel>
        <Panel title="Cost Breakdown">{[...categories.entries()].map(([category, value]) => <MetricBar key={category} label={category} value={value} max={Math.max(1, total)} money />)}</Panel>
      </div>
      <Panel title="Pricing Insights">
        {state.quotes.length < 3 ? <EmptyState title="Not enough data yet" body="Pricing suggestions will be more useful after a few completed jobs." /> : <p className="muted">Review completed job markup against schedule delays before adjusting catalog prices.</p>}
      </Panel>
    </section>
  );
}

function SettingsPage({ state, setState, exportBackup }) {
  const updateSettings = (patch) => setState((current) => ({ ...current, settings: { ...current.settings, ...patch } }));

  return (
    <Panel title="Settings">
      <div className="form-grid">
        <Field label="Company name" value={state.settings.companyName} onChange={(value) => updateSettings({ companyName: value })} />
        <label className="field">Theme mode<select value={state.settings.themeMode} onChange={(event) => updateSettings({ themeMode: event.target.value })}>{['system', 'light', 'dark'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="field">Company type<select value={state.settings.companyType} onChange={(event) => updateSettings({ companyType: event.target.value })}>{companyTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <Field label="Default tax rate" type="number" value={state.settings.taxRate} onChange={(value) => updateSettings({ taxRate: value })} />
        <Field label="Valid for days" type="number" value={state.settings.validForDays} onChange={(value) => updateSettings({ validForDays: value })} />
        <label className="field">Contractor expiry<select value={state.settings.expiryEnabled ? 'on' : 'off'} onChange={(event) => updateSettings({ expiryEnabled: event.target.value === 'on' })}><option value="on">on</option><option value="off">off</option></select></label>
        <Field label="Expiry amount" type="number" value={state.settings.expiryAmount} onChange={(value) => updateSettings({ expiryAmount: value })} />
        <label className="field">Expiry unit<select value={state.settings.expiryUnit} onChange={(event) => updateSettings({ expiryUnit: event.target.value })}>{['months', 'weeks', 'days'].map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="section-divider button-row">
        <button className="small-button" onClick={exportBackup}><Download size={15} /> Export backup</button>
        <button className="danger-button" onClick={() => setState(createInitialState())}><Trash2 size={15} /> Reset demo data</button>
      </div>
    </Panel>
  );
}

function CrudPage({ title, records, selected, setSelected, label, detail, onNew, onDelete }) {
  return (
    <section className="crud-layout">
      <Panel title={title} action={<button className="small-button" onClick={onNew}><Plus size={15} /> New</button>}>
        <div className="record-list">
          {records.map((record) => (
            <button key={record.id} className={`record-row ${record.id === selected?.id ? 'selected' : ''}`} onClick={() => setSelected(record.id)}>
              <div>
                <strong>{label(record)}</strong>
                <span>{record.email || record.trade || record.category || record.status || 'Saved record'}</span>
              </div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={selected ? label(selected) : 'Select a record'} action={selected && <button className="danger-button" onClick={onDelete}><Trash2 size={15} /> Delete</button>}>
        {selected ? detail : <EmptyState title="Nothing selected" body="Choose a record or create a new one." />}
      </Panel>
    </section>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = 'text', disabled = false }) {
  return (
    <label className="field">
      {label}
      <input type={type} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StatCard({ label, value, tone = '', onClick }) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component className={`stat-card ${tone}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Component>
  );
}

function MetricBar({ label, value, max, money = false }) {
  const percent = Math.min(100, (Number(value) / max) * 100);
  return (
    <div className="metric-bar">
      <div><span>{label}</span><b>{money ? formatMoney(value) : value}</b></div>
      <i><em style={{ width: `${percent}%` }} /></i>
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <Contact size={28} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export default App;
