const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Resend } = require('resend');

const Customer = require('./models/Customer');
const Quote = require('./models/Quote');

const app = express();
app.use(cors());
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
const PORT = process.env.PORT || 5000;
const PUBLIC_BASE_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${PORT}`;
const APPROVAL_STORE_PATH = path.join(__dirname, 'data', 'quote-approvals.json');

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));
} else {
  console.log('MONGODB_URI not configured. Mongo-backed routes will be unavailable.');
}

// Customers API
app.get('/api/customers', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json(customer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Quotes API
app.get('/api/quotes', async (req, res) => {
  try {
    const quotes = await Quote.find().populate('customer').sort({ createdAt: -1 });
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/quotes', async (req, res) => {
  try {
    const quote = new Quote(req.body);
    await quote.save();
    res.status(201).json(quote);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Send Email Quote
app.post('/api/quotes/:id/send', async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id).populate('customer');
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    if (!process.env.RESEND_API_KEY) {
      console.log('Sending mock email for Quote: ', quote._id);
      return res.json({ message: 'Email details logged to console (mock). Please configure RESEND_API_KEY.' });
    }

    const { data, error } = await resend.emails.send({
      from: 'Quotes <onboarding@resend.dev>',
      to: [quote.customer.email],
      subject: `Your Quote: ${quote.title}`,
      html: `
        <h1>Quote: ${quote.title}</h1>
        <p>Project Address: ${quote.projectAddress}</p>
        <p>Grand Total: $${quote.grandTotal.toFixed(2)}</p>
        <!-- further details here -->
      `
    });

    if (error) {
      return res.status(400).json({ error });
    }

    res.json({ message: 'Email sent', data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function money(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function readApprovalStore() {
  try {
    if (!fs.existsSync(APPROVAL_STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(APPROVAL_STORE_PATH, 'utf8'));
  } catch (error) {
    console.error('Unable to read approval store:', error);
    return [];
  }
}

function writeApprovalStore(records) {
  fs.mkdirSync(path.dirname(APPROVAL_STORE_PATH), { recursive: true });
  fs.writeFileSync(APPROVAL_STORE_PATH, JSON.stringify(records, null, 2));
}

function createApprovalRecord(payload) {
  const quote = payload.quote || {};
  const customer = payload.customer || {};
  const now = new Date().toISOString();
  const records = readApprovalStore();
  const record = {
    token: randomUUID(),
    quoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    quoteTitle: quote.title,
    customerName: customer.name,
    customerEmail: customer.email,
    total: payload.totals?.total,
    status: 'pending',
    sentAt: now,
    approvedAt: '',
  };

  writeApprovalStore([record, ...records]);
  return record;
}

function buildQuoteEmailHtml(payload, approvalUrl) {
  const quote = payload.quote || {};
  const customer = payload.customer || {};
  const totals = payload.totals || {};
  const changesSubject = encodeURIComponent(`Changes requested for quote ${quote.quoteNumber || quote.title || ''}`.trim());
  const replyTo = payload.replyTo || 'owner@buildquote.local';
  const changesBody = encodeURIComponent(`I would like to request changes for quote ${quote.quoteNumber || quote.title || ''}.`);
  const itemRows = (quote.items || []).map((item) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name || 'Line item')}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.quantity || 0)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.unit || '')}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(item.pricePerUnit)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(item.total)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.5;max-width:760px;margin:0 auto;">
      <h1 style="margin:0 0 8px;">${escapeHtml(quote.title || 'Project quote')}</h1>
      <p style="margin:0 0 24px;color:#667085;">${escapeHtml(quote.quoteNumber || '')}</p>
      <p>Hello ${escapeHtml(customer.name || 'there')},</p>
      <p>${escapeHtml(payload.message || 'Please review the quote details below. You can approve the quote directly from this email.')}</p>
      <div style="padding:16px;background:#f3f4f6;border-radius:8px;margin:18px 0;">
        <strong>Project address</strong><br />
        ${escapeHtml(quote.projectAddress || 'Not provided')}
      </div>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead>
          <tr>
            <th style="padding:10px;text-align:left;border-bottom:2px solid #d9dee7;">Item</th>
            <th style="padding:10px;text-align:left;border-bottom:2px solid #d9dee7;">Qty</th>
            <th style="padding:10px;text-align:left;border-bottom:2px solid #d9dee7;">Unit</th>
            <th style="padding:10px;text-align:right;border-bottom:2px solid #d9dee7;">Unit price</th>
            <th style="padding:10px;text-align:right;border-bottom:2px solid #d9dee7;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;margin:22px 0;">
        <div>Subtotal: ${money(totals.subtotal)}</div>
        <div>Markup: ${money(totals.markup)}</div>
        <div>Tax: ${money(totals.tax)}</div>
        <strong style="font-size:20px;">Grand total: ${money(totals.total)}</strong>
      </div>
      <div style="margin:28px 0;">
        <a href="${escapeHtml(approvalUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;margin-right:10px;">Approve quote</a>
        <a href="mailto:${encodeURIComponent(replyTo)}?subject=${changesSubject}&body=${changesBody}" style="display:inline-block;background:#f3f4f6;color:#172033;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;">Request changes</a>
      </div>
      <p style="color:#667085;font-size:13px;">Clicking Approve quote records approval for this quote and syncs it back to BuildQuote.</p>
    </div>
  `;
}

app.post('/api/quote-emails/send', async (req, res) => {
  try {
    const payload = req.body;
    const customerEmail = payload.customer?.email;

    if (!customerEmail) {
      return res.status(400).json({ error: 'Customer email is required.' });
    }

    const approval = createApprovalRecord(payload);
    const approvalUrl = `${PUBLIC_BASE_URL}/api/quote-approvals/${approval.token}/approve`;
    const subject = payload.subject || `Quote ${payload.quote?.quoteNumber || ''}: ${payload.quote?.title || 'Project quote'}`;
    const html = buildQuoteEmailHtml(payload, approvalUrl);

    if (!process.env.RESEND_API_KEY) {
      console.log('Mock quote email:', { to: customerEmail, subject, quote: payload.quote?.quoteNumber });
      return res.json({
        message: 'Mock email prepared. Configure RESEND_API_KEY to send through Resend.',
        previewHtml: html,
        approvalUrl,
      });
    }

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'BuildQuote <onboarding@resend.dev>',
      to: [customerEmail],
      replyTo: payload.replyTo || undefined,
      subject,
      html,
    });

    if (error) {
      return res.status(400).json({ error });
    }

    res.json({ message: 'Quote email sent.', data, approvalUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/quote-approvals', (req, res) => {
  const quoteIds = String(req.query.quoteIds || '').split(',').filter(Boolean);
  const records = readApprovalStore();
  const filtered = quoteIds.length ? records.filter((record) => quoteIds.includes(record.quoteId)) : records;
  res.json(filtered);
});

app.get('/api/quote-approvals/:token/approve', (req, res) => {
  const records = readApprovalStore();
  const recordIndex = records.findIndex((record) => record.token === req.params.token);

  if (recordIndex === -1) {
    return res.status(404).send(`
      <main style="font-family:Arial,sans-serif;max-width:640px;margin:80px auto;color:#172033;">
        <h1>Approval link not found</h1>
        <p>This quote approval link is invalid or no longer available.</p>
      </main>
    `);
  }

  const approvedAt = records[recordIndex].approvedAt || new Date().toISOString();
  records[recordIndex] = {
    ...records[recordIndex],
    status: 'approved',
    approvedAt,
  };
  writeApprovalStore(records);

  res.send(`
    <main style="font-family:Arial,sans-serif;max-width:680px;margin:80px auto;color:#172033;line-height:1.5;">
      <div style="display:inline-block;background:#d1fae5;color:#047857;padding:8px 12px;border-radius:999px;font-weight:700;">Approved</div>
      <h1 style="margin:18px 0 8px;">Quote approved</h1>
      <p>Thank you. Quote ${escapeHtml(records[recordIndex].quoteNumber || records[recordIndex].quoteTitle || '')} has been approved and the contractor's BuildQuote workspace will sync this approval.</p>
      <p style="color:#667085;">Approved at ${escapeHtml(new Date(approvedAt).toLocaleString())}</p>
    </main>
  `);
});

app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
