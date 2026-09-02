import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * API endpoint to manage email preferences
 * POST - Update email preferences for a user
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const type = String(body.type || '').trim().toLowerCase();
    const value = body.value;

    if (!email || !type || value === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: email, type, value' },
        { status: 400 },
      );
    }

    const validTypes = ['promotional', 'orders', 'updates'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid email type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    await connectDB();

    let user = await User.findOne({
      email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (!user) {
      const newUser = new User({
        _id: `guest_${Date.now()}`,
        email,
        emailPreferences: {
          promotional: type === 'promotional' ? Boolean(value) : true,
          orders: type === 'orders' ? Boolean(value) : true,
          updates: type === 'updates' ? Boolean(value) : true,
        },
      });
      await newUser.save();

      return NextResponse.json({
        success: true,
        message: `Email preference updated for ${email}`,
        preferences: newUser.emailPreferences,
      });
    }

    if (!user.emailPreferences) {
      user.emailPreferences = {
        promotional: true,
        orders: true,
        updates: true,
      };
    }

    user.emailPreferences[type] = Boolean(value);
    user.email = email;
    user.markModified('emailPreferences');
    await user.save();

    return NextResponse.json({
      success: true,
      message: `Email preference updated for ${email}`,
      preferences: user.emailPreferences,
    });
  } catch (error) {
    console.error('Error updating email preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update email preferences' },
      { status: 500 },
    );
  }
}

/**
 * GET - Retrieve email preferences for a user
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = normalizeEmail(searchParams.get('email'));

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 },
      );
    }

    await connectDB();

    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).select('emailPreferences email');

    if (!user) {
      return NextResponse.json({
        success: true,
        email,
        preferences: {
          promotional: true,
          orders: true,
          updates: true,
        },
        message: 'User not found, returning default preferences',
      });
    }

    return NextResponse.json({
      success: true,
      email,
      preferences: user.emailPreferences || {
        promotional: true,
        orders: true,
        updates: true,
      },
    });
  } catch (error) {
    console.error('Error retrieving email preferences:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve email preferences' },
      { status: 500 },
    );
  }
}
