import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Ticket from '@/models/Ticket';
import { getAuth } from '@/lib/firebase-admin';
import { sendTicketCreatedEmail } from '@/lib/emailService';

const CATEGORY_LABELS = new Set([
  'Order Issue',
  'Product Question',
  'Payment Issue',
  'Account Issue',
  'Return Request',
  'Complaint',
  'Other'
]);

const normalizeCategory = (value) => {
  if (!value) return null;
  if (CATEGORY_LABELS.has(value)) return value;
  const key = String(value).trim().toLowerCase();
  const map = {
    general: 'Other',
    other: 'Other',
    order: 'Order Issue',
    'order issue': 'Order Issue',
    product: 'Product Question',
    'product question': 'Product Question',
    payment: 'Payment Issue',
    'payment problem': 'Payment Issue',
    'payment issue': 'Payment Issue',
    account: 'Account Issue',
    'account issue': 'Account Issue',
    return: 'Return Request',
    'return request': 'Return Request',
    complaint: 'Complaint',
    refund: 'Return Request',
    shipping: 'Other',
    'shipping delay': 'Other'
  };
  return map[key] || null;
};

const normalizeOrderId = (value) => {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  return mongoose.Types.ObjectId.isValid(trimmed) ? trimmed : null;
};

// GET - Fetch user's tickets
export async function GET(request) {
  try {
    await connectDB();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const tickets = await Ticket.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ 
      success: true, 
      tickets 
    });
  } catch (error) {
    console.error('Tickets GET error:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

// POST - Create new ticket
export async function POST(request) {
  try {
    await connectDB();

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;
    const userName = decodedToken.name || decodedToken.email;

    const { subject, category, description, priority, orderId } = await request.json();

    if (!subject || !category || !description) {
      return NextResponse.json({ 
        error: 'Subject, category, and description are required' 
      }, { status: 400 });
    }

    const normalizedCategory = normalizeCategory(category);
    if (!normalizedCategory) {
      return NextResponse.json({
        error: 'Invalid category. Please choose a valid category.'
      }, { status: 400 });
    }

    const normalizedOrderId = normalizeOrderId(orderId);
    if (orderId && normalizedOrderId === null) {
      return NextResponse.json({
        error: 'Order number is invalid. Please enter a valid order ID.'
      }, { status: 400 });
    }

    const ticket = await Ticket.create({
      userId,
      userEmail,
      userName,
      subject,
      category: normalizedCategory,
      description,
      priority: priority || 'normal',
      orderId: normalizedOrderId,
      status: 'open'
    });

    // Send email notifications without blocking the response
    sendTicketCreatedEmail(ticket).catch((emailError) => {
      console.error('Email notification failed:', emailError);
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Ticket created successfully',
      ticket 
    }, { status: 201 });
  } catch (error) {
    console.error('Ticket POST error:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
