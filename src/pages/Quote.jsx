import { useState, useEffect } from 'react';
import { Plus, Trash2, Send } from 'lucide-react';
import './Quote.css';

const TAX_RATES = {
  'AB': 5, 'BC': 12, 'MB': 12, 'NB': 15, 'NL': 15, 'NT': 5,
  'NS': 15, 'NU': 5, 'ON': 13, 'PE': 15, 'QC': 15, 'SK': 11, 'YT': 5
};

const UNITS = ['Each', 'Sheet', 'Panel', 'Board', 'Foot', 'SqFt', 'Hour', 'Day', 'Lump Sum'];
const CATEGORIES = ['Material', 'Labor', 'Equipment', 'Subcontractor', 'Other'];

export default function Quote() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('new');
  
  // New Customer Form State
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '', province: 'ON' });

  // Quote State
  const [quoteTitle, setQuoteTitle] = useState('');
  const [projectAddress, setProjectAddress] = useState('');
  const [startDate, setStartDate] = useState('');
  const [rooms, setRooms] = useState([]);
  
  const [statusMsg, setStatusMsg] = useState('');

  // Fetch Customers
  useEffect(() => {
    fetch('http://localhost:5000/api/customers')
      .then(res => res.json())
      .then(data => setCustomers(data))
      .catch(console.error);
  }, []);

  const addRoom = () => {
    setRooms([...rooms, { id: Date.now().toString(), roomName: 'New Room', items: [] }]);
  };

  const updateRoomName = (roomId, newName) => {
    setRooms(rooms.map(r => r.id === roomId ? { ...r, roomName: newName } : r));
  };

  const deleteRoom = (roomId) => {
    setRooms(rooms.filter(r => r.id !== roomId));
  };

  const addItem = (roomId) => {
    const updated = rooms.map(r => {
      if (r.id === roomId) {
        return { 
          ...r, 
          items: [...r.items, { 
            id: Date.now().toString(), title: '', quantity: 1, unit: 'Each', category: 'Material', price: 0, markup: 20 
          }] 
        };
      }
      return r;
    });
    setRooms(updated);
  };

  const deleteItem = (roomId, itemId) => {
    setRooms(rooms.map(r => {
      if (r.id === roomId) return { ...r, items: r.items.filter(i => i.id !== itemId) };
      return r;
    }));
  };

  const updateItem = (roomId, itemId, field, value) => {
    setRooms(rooms.map(r => {
      if (r.id === roomId) {
        return {
          ...r,
          items: r.items.map(i => i.id === itemId ? { ...i, [field]: value } : i)
        };
      }
      return r;
    }));
  };

  // Calculations
  const calcItemTotal = (item) => {
    const p = parseFloat(item.price) || 0;
    const q = parseFloat(item.quantity) || 0;
    const m = parseFloat(item.markup) || 0;
    return (p * q) * (1 + m/100);
  };

  const calcItemBase = (item) => {
    return (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
  };

  let subtotalBase = 0;
  let totalCalculated = 0;

  rooms.forEach(r => {
    r.items.forEach(i => {
      subtotalBase += calcItemBase(i);
      totalCalculated += calcItemTotal(i);
    });
  });

  const totalMarkup = totalCalculated - subtotalBase;
  
  // Tax logic
  let activeProvince = 'ON';
  if (selectedCustomerId === 'new') {
    activeProvince = newCustomer.province;
  } else {
    const c = customers.find(x => x._id === selectedCustomerId);
    if (c) activeProvince = c.province || 'ON';
  }

  const taxRate = TAX_RATES[activeProvince] || 0;
  const taxAmount = totalCalculated * (taxRate / 100);
  const grandTotal = totalCalculated + taxAmount;

  const saveQuoteAndEmail = async () => {
    try {
      setStatusMsg('Saving quote...');
      let customerId = selectedCustomerId;
      
      // 1. Create customer if new
      if (customerId === 'new') {
        const cRes = await fetch('http://localhost:5000/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCustomer)
        });
        const cData = await cRes.json();
        customerId = cData._id;
        setCustomers([{...newCustomer, _id: customerId}, ...customers]);
        setSelectedCustomerId(customerId);
      }

      // 2. Save Quote
      const quotePayload = {
        title: quoteTitle,
        customer: customerId,
        projectAddress: projectAddress,
        startDate,
        rooms: rooms.map(r => ({
          roomName: r.roomName,
          items: r.items.map(i => ({
            ...i,
            total: calcItemTotal(i)
          }))
        })),
        taxRate,
        subtotal: subtotalBase,
        totalMarkup,
        taxAmount,
        grandTotal
      };

      const qRes = await fetch('http://localhost:5000/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotePayload)
      });
      const quote = await qRes.json();

      setStatusMsg('Sending email...');
      
      // 3. Email Quote
      await fetch(`http://localhost:5000/api/quotes/${quote._id}/send`, { method: 'POST' });
      
      setStatusMsg('Quote sent successfully!');
      setTimeout(() => setStatusMsg(''), 3000);
    } catch(e) {
      console.error(e);
      setStatusMsg('Error saving/sending quote.');
    }
  };

  return (
    <div className="quote-builder-layout">
      <div className="quote-header">
        <h1>Proposal Builder</h1>
        <div className="quote-actions">
          {statusMsg && <span className="status-badge">{statusMsg}</span>}
          <button className="btn-primary" onClick={saveQuoteAndEmail}>
            <Send size={16} /> Save & Email Quote
          </button>
        </div>
      </div>

      <div className="quote-grid">
        {/* Left Column: Details */}
        <div className="quote-col">
          <div className="panel glass-panel">
            <h3>Customer Details</h3>
            
            <div className="form-group mt-15">
              <label>Select Customer</label>
              <select 
                value={selectedCustomerId} 
                onChange={e => {
                  setSelectedCustomerId(e.target.value);
                  const c = customers.find(x => x._id === e.target.value);
                  if (c) setProjectAddress(c.address || '');
                }}
                className="input-field"
              >
                <option value="new">+ Create New Customer</option>
                {customers.map(c => (
                  <option key={c._id} value={c._id}>{c.name} ({c.email})</option>
                ))}
              </select>
            </div>

            {selectedCustomerId === 'new' && (
              <div className="new-customer-form animate-fade-in delay-1">
                <input 
                  type="text" placeholder="Full Name" className="input-field mt-10"
                  value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                />
                <input 
                  type="email" placeholder="Email Address" className="input-field mt-10"
                  value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                />
                <input 
                  type="tel" placeholder="Phone Number" className="input-field mt-10"
                  value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                />
                <input 
                  type="text" placeholder="Billing Address" className="input-field mt-10"
                  value={newCustomer.address} onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                />
                <div className="form-group mt-10">
                  <label>Province</label>
                  <select 
                    className="input-field"
                    value={newCustomer.province} 
                    onChange={e => setNewCustomer({...newCustomer, province: e.target.value})}
                  >
                    {Object.keys(TAX_RATES).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="panel glass-panel">
            <h3>Project Details</h3>
            <div className="form-group mt-15">
              <label>Project Title</label>
              <input type="text" className="input-field" placeholder="e.g. Smith Kitchen Remodel" value={quoteTitle} onChange={e => setQuoteTitle(e.target.value)} />
            </div>
            <div className="form-group mt-10">
              <label>Project Address</label>
              <input type="text" className="input-field" placeholder="Address" value={projectAddress} onChange={e => setProjectAddress(e.target.value)} />
            </div>
            <div className="form-split mt-10">
              <div className="form-group w-50">
                <label>Quote Date</label>
                <input type="date" className="input-field" defaultValue={new Date().toISOString().substring(0,10)} readOnly />
              </div>
              <div className="form-group w-50">
                <label>Start Date</label>
                <input type="date" className="input-field" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
            </div>
          </div>
          
          <div className="panel glass-panel summary-panel">
            <h3>Estimate Summary</h3>
            <div className="summary-row mt-15">
              <span>Subtotal (Base Price)</span>
              <span>${subtotalBase.toFixed(2)}</span>
            </div>
            <div className="summary-row border-bottom">
              <span>Total Markup</span>
              <span className="orange-text">+${totalMarkup.toFixed(2)}</span>
            </div>
            <div className="summary-row mt-10">
              <span>Subtotal w/ Markup</span>
              <span>${totalCalculated.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Tax ({activeProvince} @ {taxRate}%)</span>
              <span>${taxAmount.toFixed(2)}</span>
            </div>
            <div className="summary-row grand-total mt-15">
              <span>Grand Total</span>
              <span>${grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Line Items */}
        <div className="quote-col col-main">
          <div className="panel glass-panel header-panel">
            <h3>Rooms & Scopes</h3>
            <button className="btn-outline btn-sm" onClick={addRoom}>
              <Plus size={16} /> Add Room
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="empty-state glass-panel">
              <p>No rooms added yet. Start building your quote.</p>
              <button className="btn-primary mt-15" onClick={addRoom}>+ Add First Room</button>
            </div>
          ) : (
            <div className="rooms-container">
              {rooms.map((room) => (
                <div key={room.id} className="room-card glass-panel">
                  <div className="room-header">
                    <input 
                      type="text"
                      className="room-name-input"
                      value={room.roomName}
                      onChange={(e) => updateRoomName(room.id, e.target.value)}
                    />
                    <div>
                      <button className="btn-icon" onClick={() => addItem(room.id)} title="Add Item"><Plus size={16} /></button>
                      <button className="btn-icon text-red" onClick={() => deleteRoom(room.id)} title="Delete Room"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  
                  <div className="items-container">
                    {room.items.length > 0 && (
                      <div className="item-row header-row">
                        <div className="col-desc">Description</div>
                        <div className="col-cat">Category</div>
                        <div className="col-qty">Qty</div>
                        <div className="col-unit">Unit</div>
                        <div className="col-price">Unit Cost</div>
                        <div className="col-mu">MU(%)</div>
                        <div className="col-total">Total</div>
                        <div className="col-act"></div>
                      </div>
                    )}
                    
                    {room.items.map(item => (
                      <div key={item.id} className="item-row item-form-row">
                        <div className="col-desc">
                          <input type="text" className="simple-input" placeholder="Item name" value={item.title} onChange={e => updateItem(room.id, item.id, 'title', e.target.value)} />
                        </div>
                        <div className="col-cat">
                          <select className="simple-input" value={item.category} onChange={e => updateItem(room.id, item.id, 'category', e.target.value)}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="col-qty">
                          <input type="number" step="0.01" className="simple-input text-right" value={item.quantity} onChange={e => updateItem(room.id, item.id, 'quantity', e.target.value)} />
                        </div>
                        <div className="col-unit">
                          <select className="simple-input" value={item.unit} onChange={e => updateItem(room.id, item.id, 'unit', e.target.value)}>
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="col-price">
                          <input type="number" step="0.01" className="simple-input text-right" placeholder="$" value={item.price} onChange={e => updateItem(room.id, item.id, 'price', e.target.value)} />
                        </div>
                        <div className="col-mu">
                          <input type="number" className="simple-input text-center" value={item.markup} onChange={e => updateItem(room.id, item.id, 'markup', e.target.value)} />
                        </div>
                        <div className="col-total text-right bold">
                          ${calcItemTotal(item).toFixed(2)}
                        </div>
                        <div className="col-act text-center">
                          <button className="btn-icon text-red" onClick={() => deleteItem(room.id, item.id)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {room.items.length === 0 && <p className="mt-10 text-muted">No line items in this room.</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
