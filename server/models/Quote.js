const mongoose = require('mongoose');

const QuoteItemSchema = new mongoose.Schema({
  title: String,
  quantity: Number,
  unit: String,
  category: String,
  price: Number,
  markup: Number,
  total: Number
});

const RoomSchema = new mongoose.Schema({
  roomName: String,
  items: [QuoteItemSchema]
});

const QuoteSchema = new mongoose.Schema({
  title: String,
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  projectAddress: String,
  quoteDate: { type: Date, default: Date.now },
  startDate: { type: Date },
  rooms: [RoomSchema],
  taxRate: Number,
  subtotal: Number,
  totalMarkup: Number,
  taxAmount: Number,
  grandTotal: Number,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quote', QuoteSchema);
