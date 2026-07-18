import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
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
  Menu,
  MapPin,
  Mail,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  Search,
  Send,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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

const navGroups = [
  ['Overview', ['dashboard']],
  ['Sales', ['quotes', 'customers']],
  ['Operations', ['schedule', 'takeoff', 'contractors']],
  ['Resources', ['pricing', 'templates', 'analysis']],
  ['Administration', ['settings']],
];

function SiteFlowLogo({ compact = false }) {
  return <div className="siteflow-logo"><span className="siteflow-mark" aria-hidden="true"><i /><i /><i /></span>{!compact && <span><strong>SiteFlow</strong><small>Construction operations, simplified</small></span>}</div>;
}

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

const provinceAliases = {
  Alberta: 'AB',
  'British Columbia': 'BC',
  Manitoba: 'MB',
  'New Brunswick': 'NB',
  'Newfoundland and Labrador': 'NL',
  'Northwest Territories': 'NT',
  'Nova Scotia': 'NS',
  Nunavut: 'NU',
  Ontario: 'ON',
  'Prince Edward Island': 'PE',
  Quebec: 'QC',
  Québec: 'QC',
  Saskatchewan: 'SK',
  Yukon: 'YT',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function displayCustomer(customer) {
  return customer?.customerName || customer?.companyName || 'Customer';
}

function customerAddress(customer) {
  if (!customer) return '';
  return [customer.address, customer.unitNumber, customer.city, customer.province, customer.postalCode].filter(Boolean).join(', ');
}

function customerTaxRate(customer) {
  return TAX_RATES[customer?.province] ?? TAX_RATES.ON;
}

function normalizeProvince(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  const upper = trimmed.toUpperCase();
  return TAX_RATES[upper] !== undefined ? upper : provinceAliases[trimmed] || '';
}

function taxRateForQuote(quote, customers) {
  const customer = customers.find((item) => item.id === quote.customerId);
  return customer ? customerTaxRate(customer) : quote.taxRate;
}

function parseAddressSuggestion(result) {
  const address = result.address || {};
  const street = [address.house_number, address.road || address.pedestrian || address.footway].filter(Boolean).join(' ');
  const city = address.city || address.town || address.village || address.municipality || address.county || '';

  return {
    address: street || result.name || '',
    city,
    province: normalizeProvince(address.state_code || address.state),
    postalCode: address.postcode || '',
  };
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

function makeQuote(sequence, customerId = '', title = '') {
  return {
    id: crypto.randomUUID(),
    sequence,
    quoteNumber: formatQuoteNumber(sequence, 'open'),
    status: 'open',
    title,
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
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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

  useEffect(() => {
    const quoteIds = state.quotes.map((quote) => quote.id).join(',');
    if (!quoteIds) return undefined;

    async function syncApprovals() {
      try {
        const response = await fetch(`http://localhost:5000/api/quote-approvals?quoteIds=${encodeURIComponent(quoteIds)}`);
        if (!response.ok) return;
        const approvals = await response.json();
        const approvedByQuoteId = new Map(
          approvals
            .filter((approval) => approval.status === 'approved' && approval.quoteId)
            .map((approval) => [approval.quoteId, approval]),
        );

        if (approvedByQuoteId.size === 0) return;

        setState((current) => {
          let changed = false;
          const quotes = current.quotes.map((quote) => {
            const approval = approvedByQuoteId.get(quote.id);
            if (!approval || quote.status !== 'open') return quote;
            changed = true;
            return touch({
              ...quote,
              status: 'approved',
              quoteNumber: formatQuoteNumber(quote.sequence, 'approved', quote.invoicePart),
              customerApprovedAt: approval.approvedAt,
            });
          });

          return changed ? { ...current, quotes } : current;
        });
      } catch {
        // Approval sync is best-effort while the local API is offline.
      }
    }

    syncApprovals();
    const interval = window.setInterval(syncApprovals, 15000);
    return () => window.clearInterval(interval);
  }, [state.quotes]);

  const selectedQuote = state.quotes.find((quote) => quote.id === selectedQuoteId) || state.quotes[0];
  const selectedCustomer = state.customers.find((customer) => customer.id === selectedCustomerId) || state.customers[0];
  const selectedContractor = state.contractors.find((contractor) => contractor.id === selectedContractorId) || state.contractors[0];
  const selectedPriceItem = state.priceList.find((item) => item.id === selectedPriceId) || state.priceList[0];

  const quoteTotals = useMemo(() => {
    const map = new Map();
    state.quotes.forEach((quote) => map.set(quote.id, calculateQuoteTotals(quote.items, taxRateForQuote(quote, state.customers))));
    return map;
  }, [state.customers, state.quotes]);

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
    const customer = state.customers.find((item) => item.id === customerId);
    const suggestedName = customer ? `${displayCustomer(customer)} quote` : 'New project quote';
    const title = window.prompt('Name this quote', suggestedName);

    if (title === null) return;

    const quote = touch({
      ...makeQuote(state.sequence.nextQuote, customerId, title.trim() || suggestedName),
      projectAddress: customerAddress(customer),
      taxRate: customer ? customerTaxRate(customer) : TAX_RATES.ON,
    });
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

  function addQuoteItem(priceItem, room = {}, insertAtTop = false) {
    const item = emptyQuoteItem(priceItem ? {
      name: priceItem.name,
      unit: priceItem.unit,
      pricePerUnit: priceItem.pricePerUnit,
      duration: priceItem.duration,
      category: priceItem.category,
      ...room,
    } : room);
    if (!insertAtTop) {
      updateQuote({ items: [...selectedQuote.items, item] });
      return;
    }

    const firstRoomItemIndex = selectedQuote.items.findIndex((candidate) => (
      room.roomId
        ? candidate.roomId === room.roomId
        : !candidate.roomId && candidate.roomName.trim().toLowerCase() === (room.roomName || '').trim().toLowerCase()
    ));
    const nextItems = [...selectedQuote.items];
    nextItems.splice(firstRoomItemIndex < 0 ? 0 : firstRoomItemIndex, 0, item);
    updateQuote({ items: nextItems });
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
    link.download = `siteflow-backup-${today()}.json`;
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
    <div className={`app-shell ${isNavCollapsed ? 'nav-collapsed' : ''} ${isMobileNavOpen ? 'mobile-nav-open' : ''}`}>
      <button className="nav-scrim" aria-label="Close navigation" onClick={() => setIsMobileNavOpen(false)} />
      <aside className={`sidebar ${isNavCollapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <button
            type="button"
            className="brand-home-button"
            onClick={() => {
              setAuthView('landing');
              setIsAuthenticated(false);
            }}
            aria-label="Go to SiteFlow landing page"
          >
            <SiteFlowLogo compact={isNavCollapsed} />
          </button>
          <button
            className="nav-collapse-button"
            type="button"
            onClick={() => setIsNavCollapsed((current) => !current)}
            aria-label={isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={isNavCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {isNavCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <button className="workspace-switcher" type="button"><span className="workspace-avatar">NF</span><span><strong>{state.settings.companyName || 'Northfield Build'}</strong><small>Owner workspace</small></span><span>⌄</span></button>
        <nav className="side-nav">
          {navGroups.map(([group, ids]) => <div className="nav-group" key={group}><p>{group}</p>{ids.map((id) => { const [, Icon, label] = navItems.find(([itemId]) => itemId === id); return <button key={id} className={activePage === id ? 'active' : ''} onClick={() => { setActivePage(id); setIsMobileNavOpen(false); }} title={isNavCollapsed ? label : undefined}><Icon size={17} /><span>{label}</span></button>; })}</div>)}
        </nav>
        <div className="sidebar-footer"><button><ShieldCheck size={17}/><span>Help & support</span></button><div className="user-chip"><span>DS</span><div><strong>Demo User</strong><small>Administrator</small></div></div></div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setIsMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
          <div className="page-context">
            <p className="eyebrow">SiteFlow / {navItems.find(([id]) => id === activePage)?.[2]}</p>
            <h1>{navItems.find(([id]) => id === activePage)?.[2]}</h1>
          </div>
          <div className="topbar-actions">
            {notice && <span className="notice">{notice}</span>}
            <label className="command-search"><Search size={16}/><input placeholder="Search SiteFlow…" aria-label="Search SiteFlow"/><kbd>⌘ K</kbd></label>
            <button className="icon-button" title="Notifications" aria-label="Notifications"><Bell size={18}/><i/></button>
            <button className="icon-button" onClick={exportBackup} title="Export backup" aria-label="Export backup"><Download size={18} /></button>
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

function LandingPage({ stats, quoteCount, onLogin, onDemo }) {
  const features = [
    ['Quote faster', 'Build accurate estimates from saved pricing and reusable room templates.'],
    ['Protect your margins', 'See markup, tax, and project value clearly before anything reaches a customer.'],
    ['Stay on schedule', 'Turn approved scope into sequenced work and spot delays before they spread.'],
    ['One customer record', 'Keep contacts, job details, quotes, and activity connected.'],
    ['Coordinate contractors', 'Match trades to work and keep assignment details close to the schedule.'],
    ['Reduce admin', 'Replace scattered spreadsheets and follow-ups with one operating workspace.'],
  ];
  return (
    <div className="marketing-page">
      <header className="marketing-nav">
        <SiteFlowLogo />
        <nav className="marketing-links" aria-label="Main navigation"><a href="#product">Product</a><a href="#solutions">Solutions</a><a href="#pricing">Pricing</a><a href="#resources">Resources</a></nav>
        <div className="marketing-actions">
          <button className="text-button" onClick={onLogin}>Sign in</button>
          <button className="primary-button" onClick={onDemo}>Start free trial <ArrowRight size={16} /></button>
        </div>
      </header>

      <main className="marketing-hero">
        <section className="hero-copy">
          <span className="security-badge"><Sparkles size={15} /> Built for modern construction teams</span>
          <h1>Run every construction project from one organized workspace.</h1>
          <p>SiteFlow brings quoting, scheduling, customers, contractors, material takeoffs, and project tracking together—so your team can move faster without losing control.</p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={onDemo}>Start free trial <ArrowRight size={17} /></button>
            <button className="small-button large" onClick={onDemo}>View interactive demo</button>
          </div>
          <small className="trust-note"><CheckCircle2 size={14}/> No credit card required · Setup in minutes</small>
        </section>

        <section className="hero-dashboard" aria-label="SiteFlow dashboard preview">
          <div className="mock-sidebar"><SiteFlowLogo compact/><i/><i/><i/><i/><i/></div>
          <div className="mock-main"><div className="preview-top"><span>Operations overview</span><strong>Today</strong></div><div className="preview-grid"><div><span>Open quotes</span><b>{stats.openQuotes.length}</b><small>+12% this month</small></div><div><span>Active projects</span><b>{stats.activeQuotes.length}</b><small>All teams</small></div><div><span>Pipeline value</span><b>{formatMoney(stats.totalValue)}</b><small>Across {quoteCount} quotes</small></div></div><div className="mock-chart"><div><strong>Quote value</strong><span>Last 6 months</span></div><svg viewBox="0 0 600 150" preserveAspectRatio="none"><path d="M0 130 C80 110 105 120 170 82 S260 110 330 62 S430 88 490 38 S560 45 600 16"/><path className="area" d="M0 130 C80 110 105 120 170 82 S260 110 330 62 S430 88 490 38 S560 45 600 16 V150 H0Z"/></svg></div></div>
        </section>
      </main>

      <section className="logo-strip"><p>Trusted workflows for growing builders</p><div><b>NORTHLINE</b><b>FIELDSTONE</b><b>ARC & CO.</b><b>SUMMIT</b><b>HOMESTEAD</b></div></section>
      <section className="marketing-section" id="product"><div className="section-heading"><span>One connected system</span><h2>Less time managing software. More time moving work forward.</h2><p>Give your team a clear process from first estimate to final handoff.</p></div><div className="benefit-grid">{features.slice(0,3).map(([title,body], index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{body}</p></article>)}</div></section>
      <section className="workflow-section" id="solutions"><div><span>QUOTE TO COMPLETION</span><h2>A workflow your whole team can follow.</h2><p>Scope the work, win approval, schedule the right trade, and track delivery without re-entering information.</p></div><ol>{['Build an accurate quote','Get customer approval','Create the project schedule','Track work to completion'].map((step,index)=><li key={step}><b>{index+1}</b><span><strong>{step}</strong><small>{['Use saved pricing and margin controls.','Send a clear, professional scope.','Sequence tasks and assign contractors.','See progress, risks, and handoff details.'][index]}</small></span></li>)}</ol></section>
      <section className="marketing-section" id="resources"><div className="section-heading"><span>EVERYTHING IN CONTEXT</span><h2>Operational control without enterprise complexity.</h2></div><div className="feature-grid">{features.slice(3).map(([title,body])=><article key={title}><CheckCircle2 size={20}/><h3>{title}</h3><p>{body}</p></article>)}</div></section>
      <section className="testimonial"><blockquote>“SiteFlow gives us one reliable place to see what was quoted, who is doing the work, and what needs attention next. That clarity protects our time and our margin.”</blockquote><p><strong>Marcus Chen</strong><span>Operations Director, Northline Renovations</span></p></section>
      <section className="pricing-preview" id="pricing"><div><span>Simple, transparent pricing</span><h2>Built to pay for itself in one better-managed project.</h2><p>Start with every core workflow. Add your team when you’re ready.</p></div><article><small>SiteFlow Pro</small><h3>$89 <span>/ month</span></h3><ul><li>Unlimited quotes and projects</li><li>Scheduling and contractor records</li><li>Material takeoffs and reporting</li></ul><button className="primary-button large" onClick={onDemo}>Start free trial</button></article></section>
      <section className="faq"><div className="section-heading"><span>FAQ</span><h2>Questions, answered.</h2></div>{[['Can I keep my existing data?','Yes. SiteFlow keeps your current quote, customer, contractor, pricing, and schedule records intact.'],['Is SiteFlow just for general contractors?','No. The workflow fits renovation companies and specialty contractors that quote and coordinate project work.'],['Can I try it before paying?','Yes. Start with the interactive workspace and explore the full workflow without a credit card.']].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</section>
      <section className="final-cta"><SiteFlowLogo compact/><h2>Bring every project into focus.</h2><p>Quote faster, protect margins, and keep your team aligned from first contact to final handoff.</p><button className="primary-button large" onClick={onDemo}>Start free trial <ArrowRight size={17}/></button></section>
      <footer className="marketing-footer"><SiteFlowLogo/><p>© 2026 SiteFlow. Construction operations, simplified.</p><div><a href="#product">Product</a><a href="#pricing">Pricing</a><button onClick={onLogin}>Sign in</button></div></footer>
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
  const approvedValue = state.quotes.filter((quote) => quote.status !== 'open').reduce((sum, quote) => sum + quoteTotals.get(quote.id).total, 0);

  return (
    <section className="page-grid">
      <div className="dashboard-intro"><div><h2>Good morning, Demo</h2><p>Here’s what needs your attention across the business today.</p></div><div className="button-row"><button className="small-button"><CalendarDays size={16}/> Last 30 days</button><button className="primary-button" onClick={() => createQuote()}><Plus size={16}/> Create quote</button></div></div>
      <div className="stat-grid">
        <StatCard label="Open quotes" value={dashboardStats.openQuotes.length} trend="12% from last month" icon={FileText} onClick={() => setActivePage('quotes')} />
        <StatCard label="Active projects" value={dashboardStats.activeQuotes.length} trend="Across all crews" icon={ClipboardList} onClick={() => setActivePage('schedule')} />
        <StatCard label="Quote value" value={formatMoney(dashboardStats.totalValue)} trend="Current pipeline" icon={TrendingUp} />
        <StatCard label="Approved value" value={formatMoney(approvedValue)} trend="Ready to deliver" icon={CheckCircle2} tone="success" />
        <StatCard label="Needs attention" value={dashboardStats.delayedQuotes.length} trend="Overdue or delayed" icon={AlertTriangle} tone="warning" onClick={() => setActivePage('schedule')} />
      </div>
      <div className="dashboard-main-grid">
        <Panel className="revenue-panel" title="Quote value" action={<span className="panel-meta">Last 6 months</span>}><div className="chart-summary"><strong>{formatMoney(dashboardStats.totalValue)}</strong><span><TrendingUp size={14}/> 18.4%</span></div><div className="revenue-chart" aria-label="Quote value trend"><i style={{height:'32%'}}/><i style={{height:'48%'}}/><i style={{height:'43%'}}/><i style={{height:'68%'}}/><i style={{height:'61%'}}/><i style={{height:'84%'}}/></div><div className="chart-labels"><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span></div></Panel>
        <Panel title="Attention required"><div className="health-list"><div className="attention-row"><span className="severity amber"><AlertTriangle size={15}/></span><div><strong>Confirm project start date</strong><small>Sample bathroom refresh · Due today</small></div><button onClick={() => setActivePage('schedule')}>Review</button></div><div className="attention-row"><span className="severity copper"><CalendarDays size={15}/></span><div><strong>Assign tile contractor</strong><small>Schedule · Due tomorrow</small></div><button onClick={() => setActivePage('contractors')}>Assign</button></div></div></Panel>
      </div>
      <div className="split-grid dashboard-lower">
        <Panel title="Recent quotes" action={<button className="text-button" onClick={() => setActivePage('quotes')}>View all <ArrowRight size={14}/></button>}>
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

        <Panel title="Upcoming schedule"><div className="schedule-preview">{state.schedules.slice(0,4).map((task)=><div key={task.id}><time>{task.startDate?.slice(5) || 'TBD'}</time><span><strong>{task.name}</strong><small>{task.assignedContractorName || task.suggestedTrade}</small></span></div>)}{state.schedules.length===0 && <EmptyState title="Schedule is ready" body="Approve a quote to generate upcoming work."/>}</div></Panel>
      </div>
    </section>
  );
}

function QuotesPage(props) {
  const {
    state,
    setState,
    selectedQuote,
    setSelectedQuoteId,
    setSelectedCustomerId,
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
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState(makeCustomer);
  const [quoteSearch, setQuoteSearch] = useState('');

  if (!selectedQuote) return <EmptyState title="No quotes yet" body="Create a quote to start building project scope." />;

  const normalizedQuoteSearch = quoteSearch.trim().toLowerCase();
  const filteredQuotes = state.quotes.filter((quote) => {
    if (!normalizedQuoteSearch) return true;
    const quoteCustomer = state.customers.find((item) => item.id === quote.customerId);
    const searchableText = [
      quote.quoteNumber,
      quoteCustomer?.customerName,
      quoteCustomer?.companyName,
    ].filter(Boolean).join(' ').toLowerCase();

    return searchableText.includes(normalizedQuoteSearch);
  });

  const locked = ['completed', 'invoiced'].includes(selectedQuote.status);
  const totals = quoteTotals.get(selectedQuote.id);
  const customer = state.customers.find((item) => item.id === selectedQuote.customerId);
  const activeTaxRate = taxRateForQuote(selectedQuote, state.customers);
  const groupedQuoteItems = Array.from(selectedQuote.items.reduce((groups, item) => {
    const roomName = item.roomName.trim();
    const groupKey = item.roomId || roomName.toLowerCase();
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: item.roomId || item.itemId,
        roomName,
        items: [],
      });
    }
    groups.get(groupKey).items.push(item);
    return groups;
  }, new Map()).values());

  function saveNewCustomer() {
    if (!newCustomer.customerName.trim() && !newCustomer.companyName.trim()) {
      flash('Add a customer or company name.');
      return;
    }

    const customerRecord = touch({
      ...newCustomer,
      customerName: newCustomer.customerName.trim(),
      companyName: newCustomer.companyName.trim(),
    });

    setState((current) => ({
      ...current,
      customers: [customerRecord, ...current.customers],
      quotes: current.quotes.map((quote) => (
        quote.id === selectedQuote.id
          ? touch({
            ...quote,
            customerId: customerRecord.id,
            projectAddress: customerAddress(customerRecord) || quote.projectAddress,
            taxRate: customerTaxRate(customerRecord),
          })
          : quote
      )),
    }));
    setSelectedCustomerId(customerRecord.id);
    setNewCustomer(makeCustomer());
    setIsAddingCustomer(false);
    flash('Customer added and assigned to this quote.');
  }

  function addRoom() {
    const room = emptyQuoteItem({ roomId: crypto.randomUUID() });
    updateQuote({ items: [room, ...selectedQuote.items] });
  }

  return (
    <section className="quotes-layout">
      <Panel title="Quotes">
        <div className="quote-search">
          <Search size={16} />
          <input
            type="search"
            value={quoteSearch}
            onChange={(event) => setQuoteSearch(event.target.value)}
            placeholder="Search customer or quote number"
            aria-label="Search quotes by customer name or quote number"
          />
        </div>
        <div className="record-list quote-list">
          {filteredQuotes.map((quote) => (
            <button key={quote.id} className={`record-row ${quote.id === selectedQuote.id ? 'selected' : ''}`} onClick={() => setSelectedQuoteId(quote.id)}>
              <div>
                <strong>{quote.title || 'Untitled quote'}</strong>
                <span>{quote.quoteNumber} · {quote.status}</span>
              </div>
              <b>{formatMoney(quoteTotals.get(quote.id).total)}</b>
            </button>
          ))}
          {filteredQuotes.length === 0 && (
            <p className="quote-search-empty">No customers or quote numbers match “{quoteSearch.trim()}”.</p>
          )}
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
            <div className="field customer-picker">
              <span>Customer</span>
              <div className="customer-picker-row">
                <select value={selectedQuote.customerId} disabled={locked} onChange={(event) => {
                  const nextCustomer = state.customers.find((item) => item.id === event.target.value);
                  updateQuote({
                    customerId: event.target.value,
                    projectAddress: customerAddress(nextCustomer) || selectedQuote.projectAddress,
                    taxRate: nextCustomer ? customerTaxRate(nextCustomer) : selectedQuote.taxRate,
                  });
                }}>
                  <option value="" disabled>Select a customer</option>
                  {state.customers.map((item) => <option key={item.id} value={item.id}>{displayCustomer(item)}</option>)}
                </select>
                {!locked && (
                  <button type="button" className="small-button" onClick={() => setIsAddingCustomer((current) => !current)}>
                    <Plus size={15} /> New
                  </button>
                )}
              </div>
            </div>
            {isAddingCustomer && !locked && (
              <div className="inline-customer-form">
                <div className="form-grid">
                  <Field label="customer name" value={newCustomer.customerName} onChange={(value) => setNewCustomer((current) => ({ ...current, customerName: value }))} />
                  <Field label="company name" value={newCustomer.companyName} onChange={(value) => setNewCustomer((current) => ({ ...current, companyName: value }))} />
                  <Field label="phone" value={newCustomer.phone} onChange={(value) => setNewCustomer((current) => ({ ...current, phone: value }))} />
                  <Field label="email" type="email" value={newCustomer.email} onChange={(value) => setNewCustomer((current) => ({ ...current, email: value }))} />
                  <AddressSearch value={customerAddress(newCustomer)} onSelect={(patch) => setNewCustomer((current) => ({ ...current, ...patch }))} />
                  <Field label="unit number" value={newCustomer.unitNumber} onChange={(value) => setNewCustomer((current) => ({ ...current, unitNumber: value }))} />
                  <Field label="city" value={newCustomer.city} onChange={(value) => setNewCustomer((current) => ({ ...current, city: value }))} />
                  <label className="field">
                    province
                    <select value={newCustomer.province} onChange={(event) => setNewCustomer((current) => ({ ...current, province: event.target.value }))}>
                      {Object.keys(TAX_RATES).map((province) => <option key={province} value={province}>{province}</option>)}
                    </select>
                  </label>
                  <Field label="postal code" value={newCustomer.postalCode} onChange={(value) => setNewCustomer((current) => ({ ...current, postalCode: value }))} />
                  <Field label="notes" value={newCustomer.notes} onChange={(value) => setNewCustomer((current) => ({ ...current, notes: value }))} />
                </div>
                <div className="button-row">
                  <button type="button" className="primary-button" onClick={saveNewCustomer}><Plus size={15} /> Add customer</button>
                  <button type="button" className="small-button" onClick={() => { setNewCustomer(makeCustomer()); setIsAddingCustomer(false); }}>Cancel</button>
                </div>
              </div>
            )}
            <Field label="Project address" value={selectedQuote.projectAddress} disabled={locked} onChange={(value) => updateQuote({ projectAddress: value })} />
            <Field label="Quote date" type="date" value={selectedQuote.quoteDate} disabled={locked} onChange={(value) => updateQuote({ quoteDate: value })} />
            <Field label="Start date" type="date" value={selectedQuote.startDate} disabled={locked} onChange={(value) => updateQuote({ startDate: value })} />
            <label className="field">
              Status
              <select value={selectedQuote.status} disabled={locked} onChange={(event) => updateQuote({ status: event.target.value })}>
                {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <Field label={`Tax rate %${customer?.province ? ` (${customer.province})` : ''}`} type="number" value={activeTaxRate} disabled onChange={() => {}} />
          </div>
        </Panel>

        <Panel className="quote-line-items-panel" title="Line Items" action={!locked && <button className="small-button" onClick={addRoom}><Plus size={15} /> Room</button>}>
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
            {groupedQuoteItems.map((room) => (
              <section className="line-item-group" key={room.id}>
                <div className="line-item-group-header">
                  <label>
                    <span>Room</span>
                    <input
                      value={room.roomName}
                      placeholder="Room not set"
                      disabled={locked}
                      onChange={(event) => {
                        const itemIds = new Set(room.items.map((item) => item.itemId));
                        updateQuote({
                          items: selectedQuote.items.map((item) => (
                            itemIds.has(item.itemId) ? { ...item, roomName: event.target.value } : item
                          )),
                        });
                      }}
                    />
                  </label>
                  <div className="line-item-group-actions">
                    <span>{room.items.length} {room.items.length === 1 ? 'item' : 'items'}</span>
                    {!locked && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Add item to ${room.roomName || 'room'}`}
                        title="Add item to room"
                        onClick={() => addQuoteItem(null, {
                          roomName: room.roomName,
                          roomId: room.items[0]?.roomId || '',
                        }, true)}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="line-item-group-list">
                  {room.items.map((item) => {
                    const itemTotal = calculateQuoteItem(item);
                    return (
                      <div className="line-item" key={item.itemId}>
                        <label className="line-item-field description"><span>Description</span><input value={item.name} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { name: event.target.value })} /></label>
                        <label className="line-item-field quantity"><span>Qty</span><input type="number" value={item.quantity} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { quantity: event.target.value })} /></label>
                        <label className="line-item-field unit"><span>Unit</span><input value={item.unit} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { unit: event.target.value })} /></label>
                        <label className="line-item-field category"><span>Category</span><select value={item.category} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { category: event.target.value })}>
                          {['Labor', 'Material', 'Equipment', 'Subcontractor', 'Other'].map((category) => <option key={category}>{category}</option>)}
                        </select></label>
                        <label className="line-item-field price"><span>Price</span><input type="number" value={item.pricePerUnit} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { pricePerUnit: event.target.value })} /></label>
                        <label className="line-item-field markup"><span>Markup %</span><input type="number" value={item.markupRate} disabled={locked} onChange={(event) => updateQuoteItem(item.itemId, { markupRate: event.target.value })} /></label>
                        <div className="line-item-total"><span>Total</span><strong>{formatMoney(itemTotal.total)}</strong></div>
                        {!locked && <button className="icon-button" onClick={() => updateQuote({ items: selectedQuote.items.filter((candidate) => candidate.itemId !== item.itemId) })}><Trash2 size={15} /></button>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="quote-admin-summary">
            <div className="quote-summary-details">
              <div><span>Customer</span><strong>{customer ? displayCustomer(customer) : 'No customer selected'}</strong><small>{customer?.email || 'No email'}</small></div>
              <div><span>Project</span><strong>{selectedQuote.title || 'Untitled quote'}</strong><small>{selectedQuote.projectAddress || 'No project address'}</small></div>
              <div><span>Quote</span><strong>{selectedQuote.quoteNumber}</strong><small>{selectedQuote.status} · {selectedQuote.quoteDate}</small></div>
            </div>
            <div className="quote-summary-totals">
              <div><span>Subtotal</span><strong>{formatMoney(totals.subtotal)}</strong></div>
              <div><span>Markup</span><strong>{formatMoney(totals.markup)}</strong></div>
              <div><span>Tax ({activeTaxRate}%)</span><strong>{formatMoney(totals.tax)}</strong></div>
              <div className="grand-total"><span>Total</span><strong>{formatMoney(totals.total)}</strong></div>
            </div>
          </div>
        </Panel>

        <EmailQuotePanel key={selectedQuote.id} quote={selectedQuote} customer={customer} totals={totals} settings={state.settings} />
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

function EmailQuotePanel({ quote, customer, totals, settings }) {
  const [subject, setSubject] = useState(`Quote ${quote.quoteNumber}: ${quote.title || 'Project quote'}`);
  const [message, setMessage] = useState('Please review the quote details below. You can approve it directly from this email.');
  const [replyTo, setReplyTo] = useState('owner@buildquote.local');
  const [status, setStatus] = useState('');
  const [isSending, setIsSending] = useState(false);

  async function sendQuoteEmail() {
    if (!customer?.email) {
      setStatus('Add a customer email before sending.');
      return;
    }

    setIsSending(true);
    setStatus('Sending quote email...');

    try {
      const payload = {
        subject,
        message,
        replyTo,
        approvalTo: replyTo,
        customer: {
          name: displayCustomer(customer),
          email: customer.email,
        },
        quote: {
          id: quote.id,
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          projectAddress: quote.projectAddress,
          items: quote.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            pricePerUnit: item.pricePerUnit,
            total: calculateQuoteItem(item).total,
          })),
        },
        totals,
        company: {
          name: settings.companyName,
          type: settings.companyType,
        },
      };

      const response = await fetch('http://localhost:5000/api/quote-emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || result.error || 'Unable to send quote email.');
      }

      setStatus(result.message || 'Quote email sent.');
    } catch (error) {
      setStatus(`${error.message} Make sure the backend server is running on port 5000.`);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Panel title="Email Quote For Approval" action={<Mail size={18} />}>
      <div className="email-quote-grid">
        <div className="email-quote-copy">
          <p>
            Send the quote details to the customer through Resend. The email includes approval and
            change-request buttons that open a prefilled reply.
          </p>
          <div className="email-recipient">
            <span>To</span>
            <strong>{customer?.email || 'No customer email'}</strong>
          </div>
        </div>
        <div className="email-quote-form">
          <Field label="subject" value={subject} onChange={setSubject} />
          <Field label="approval replies to" type="email" value={replyTo} onChange={setReplyTo} />
          <label className="field">
            message
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <div className="button-row">
            <button className="primary-button" onClick={sendQuoteEmail} disabled={isSending || !customer?.email}>
              <Send size={16} /> {isSending ? 'Sending...' : 'Send quote'}
            </button>
            {status && <span className="notice">{status}</span>}
          </div>
        </div>
      </div>
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
  const updateCustomer = (patch) => updateCollection('customers', selectedCustomer.id, patch);

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
            <Field label="customer name" value={selectedCustomer.customerName} onChange={(value) => updateCustomer({ customerName: value })} />
            <Field label="company name" value={selectedCustomer.companyName} onChange={(value) => updateCustomer({ companyName: value })} />
            <Field label="phone" value={selectedCustomer.phone} onChange={(value) => updateCustomer({ phone: value })} />
            <Field label="email" type="email" value={selectedCustomer.email} onChange={(value) => updateCustomer({ email: value })} />
            <AddressSearch key={selectedCustomer.id} value={customerAddress(selectedCustomer)} onSelect={(patch) => updateCustomer(patch)} />
            <Field label="unit number" value={selectedCustomer.unitNumber} onChange={(value) => updateCustomer({ unitNumber: value })} />
            <Field label="city" value={selectedCustomer.city} onChange={(value) => updateCustomer({ city: value })} />
            <label className="field">
              province
              <select value={selectedCustomer.province} onChange={(event) => updateCustomer({ province: event.target.value })}>
                {Object.keys(TAX_RATES).map((province) => <option key={province} value={province}>{province}</option>)}
              </select>
            </label>
            <Field label="postal code" value={selectedCustomer.postalCode} onChange={(value) => updateCustomer({ postalCode: value })} />
            <Field label="notes" value={selectedCustomer.notes} onChange={(value) => updateCustomer({ notes: value })} />
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

function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`.trim()}>
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

function AddressSearch({ value, onSelect }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState('');
  const canSearch = query.trim().length >= 4;

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 4) {
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setStatus('');

      try {
        const params = new URLSearchParams({
          q: trimmed,
          format: 'jsonv2',
          addressdetails: '1',
          limit: '5',
          countrycodes: 'ca',
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) throw new Error('Address search failed');

        const results = await response.json();
        setSuggestions(results);
        setStatus(results.length ? '' : 'No address suggestions found');
      } catch (error) {
        if (error.name !== 'AbortError') {
          setSuggestions([]);
          setStatus('Address suggestions are unavailable right now');
        }
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function chooseSuggestion(result) {
    const patch = parseAddressSuggestion(result);
    onSelect(patch);
    setQuery(customerAddress(patch) || result.display_name || '');
    setSuggestions([]);
    setStatus('');
  }

  return (
    <div className="field address-search-field">
      <span>address search</span>
      <div className="address-input-wrap">
        <Search size={16} />
        <input
          value={query}
          placeholder="Search customer address"
          onChange={(event) => {
            setQuery(event.target.value);
            onSelect({ address: event.target.value });
          }}
        />
      </div>
      {canSearch && (isSearching || status || suggestions.length > 0) && (
        <div className="address-suggestions">
          {isSearching && <div className="address-status">Searching addresses...</div>}
          {!isSearching && status && <div className="address-status">{status}</div>}
          {!isSearching && suggestions.map((result) => (
            <button key={result.place_id} type="button" onClick={() => chooseSuggestion(result)}>
              <MapPin size={16} />
              <span>{result.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = '', onClick, trend = 'Updated today', icon: Icon = BarChart3 }) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component className={`stat-card ${tone}`} onClick={onClick}>
      <span className="stat-icon"><Icon size={17}/></span>
      <span>{label}</span><strong>{value}</strong><small>{trend}</small>
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
