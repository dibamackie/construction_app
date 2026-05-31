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

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

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

const PORT = 5000;
app.listen(PORT, () => console.log(`Backend server running on port ${PORT}`));
