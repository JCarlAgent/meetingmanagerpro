import React, { useState } from 'react';
import { Navigation } from '../components/Navigation';
import { Footer } from '../components/Footer';
import { AdminPanel } from '../components/AdminPanel';
import { EditableContent } from '../components/EditableContent';
import { useContent } from '../context/ContentContext';
import { supabase } from '../lib/supabase';

export const ContactPage: React.FC = () => {
  const { content } = useContent();
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    phone: '',
    specialty_interest: '',
    message: '' 
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: dbError } = await supabase
        .from('contact_submissions')
        .insert([{
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          specialty_interest: formData.specialty_interest || null,
          message: formData.message
        }]);

      if (dbError) throw dbError;

  // Mark submitted and clear form (no mailto redirect — data saved to Supabase)
  setSubmitted(true);
  setTimeout(() => setSubmitted(false), 5000);
  setFormData({ name: '', email: '', phone: '', specialty_interest: '', message: '' });
    } catch (err: any) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <AdminPanel />
      <main className="flex-grow">
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <EditableContent 
              path="contact.title" 
              value={content.contact.title} 
              as="h1" 
              className="text-4xl md:text-5xl font-bold mb-4"
            />
            <EditableContent 
              path="contact.subtitle" 
              value={content.contact.subtitle || ''} 
              as="p" 
              className="text-xl"
            />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <img 
                src={content.contact.image} 
                alt="Customer Service" 
                className="rounded-lg shadow-lg w-full h-96 object-cover"
              />
              <div className="mt-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Get in Touch</h2>
                <EditableContent 
                  path="contact.body" 
                  value={content.contact.body} 
                  as="p" 
                  className="text-gray-600 mb-6"
                  multiline
                />
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-2">Email Support</h3>
                  <a 
                    href={`mailto:${content.contact.email}`} 
                    className="text-red-600 hover:text-red-700 font-medium text-lg"
                  >
                    {content.contact.email}
                  </a>
                </div>
              </div>
            </div>

            <div>
              <div className="bg-white shadow-lg rounded-lg p-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Send us a Message</h2>
                {submitted && (
                  <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-md">
                    Thank you! Your message has been saved.
                  </div>
                )}
                {error && (
                  <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
                    {error}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">Name *</label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">Email *</label>
                    <input 
                      type="email" 
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">Phone</label>
                    <input 
                      type="tel" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">Specialty Interest</label>
                    <select 
                      value={formData.specialty_interest}
                      onChange={(e) => setFormData({...formData, specialty_interest: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    >
                      <option value="">Select a specialty...</option>
                      <option value="Cardiology">Cardiology</option>
                      <option value="Orthopedics">Orthopedics</option>
                      <option value="Neurology">Neurology</option>
                      <option value="Pediatrics">Pediatrics</option>
                      <option value="General Practice">General Practice</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">Message *</label>
                    <textarea 
                      required
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({...formData, message: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-600 focus:border-transparent"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full bg-red-600 text-white py-3 rounded-md font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Submitting...' : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};
