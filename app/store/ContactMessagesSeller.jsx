import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '@/lib/useAuth';

export default function ContactMessagesSeller() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const token = getToken ? await getToken() : '';
      const { data } = await axios.get('/api/store/contact-messages', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setMessages(data.messages || []);
    } catch (error) {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="contact-messages" className="mt-6 w-full rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.06)] sm:p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900 sm:text-xl">Contact Us Messages</h2>
      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
      ) : messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-500">
          No contact messages have been received yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Message</th>
                <th className="p-3 whitespace-nowrap">Date</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg, idx) => (
                <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="p-3 font-medium text-slate-800">{msg.name}</td>
                  <td className="p-3 text-slate-600">{msg.email}</td>
                  <td className="max-w-xs p-3 text-slate-700 sm:max-w-md">{msg.message}</td>
                  <td className="p-3 whitespace-nowrap text-slate-500">{new Date(msg.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
