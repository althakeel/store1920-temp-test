import mongoose from "mongoose";

const ReplySchema = new mongoose.Schema({
  message: { type: String, required: true },
  sender: { type: String, required: true, enum: ['user', 'admin'] },
  senderName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const TicketSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userEmail: { type: String, required: true },
  userName: { type: String },
  subject: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: ['Order Issue', 'Product Question', 'Payment Issue', 'Account Issue', 'Return Request', 'Complaint', 'Other']
  },
  description: { type: String, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  status: { 
    type: String, 
    default: 'open',
    enum: ['open', 'in-progress', 'resolved', 'closed']
  },
  priority: {
    type: String,
    default: 'normal',
    enum: ['low', 'normal', 'high', 'urgent']
  },
  replies: [ReplySchema],
  lastReplyAt: { type: Date },
  closedAt: { type: Date }
}, { timestamps: true });

TicketSchema.index({ userId: 1, createdAt: -1 });
TicketSchema.index({ status: 1 });
TicketSchema.index({ status: 1, createdAt: -1 });              // Admin dashboard sorted by date
TicketSchema.index({ userId: 1, status: 1, createdAt: -1 }); // User tickets filtered by status
TicketSchema.index({ priority: 1, status: 1, createdAt: -1 }); // Support queue (urgent first)

export default mongoose.models.Ticket || mongoose.model("Ticket", TicketSchema);
