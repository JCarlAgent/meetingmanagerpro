import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  specialty_interest: string | null;
  message: string;
  status: 'new' | 'read' | 'responded' | 'archived';
  admin_notes: string | null;
  created_at: string;
}

export const AdminContactSubmissions: React.FC = () => {
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<ContactSubmission | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    loadSubmissions();
  }, []);

  const loadSubmissions = async () => {
    try {
      const { data, error } = await supabase
        .from('contact_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubmissions(data || []);
    } catch (err) {
      console.error('Error loading submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('contact_submissions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      loadSubmissions();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const saveNotes = async (id: string) => {
    try {
      const { error } = await supabase
        .from('contact_submissions')
        .update({ admin_notes: adminNotes, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setSelectedSubmission(null);
      setAdminNotes('');
      loadSubmissions();
    } catch (err) {
      console.error('Error saving notes:', err);
    }
  };

  const filteredSubmissions = filter === 'all' 
    ? submissions 
    : submissions.filter(s => s.status === filter);

  const statusColors = {
    new: 'bg-blue-100 text-blue-800',
    read: 'bg-yellow-100 text-yellow-800',
    responded: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-800'
  };

  if (loading) {
    return <div className="text-center py-8">Loading submissions...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Contact Submissions ({submissions.length})</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('new')}
            className={`px-4 py-2 rounded ${filter === 'new' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            New
          </button>
          <button
            onClick={() => setFilter('read')}
            className={`px-4 py-2 rounded ${filter === 'read' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            Read
          </button>
          <button
            onClick={() => setFilter('responded')}
            className={`px-4 py-2 rounded ${filter === 'responded' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            Responded
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Specialty</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSubmissions.map((submission) => (
              <tr key={submission.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(submission.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {submission.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <a href={`mailto:${submission.email}`} className="text-red-600 hover:text-red-700">
                    {submission.email}
                  </a>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {submission.specialty_interest || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${statusColors[submission.status]}`}>
                    {submission.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => {
                      setSelectedSubmission(submission);
                      setAdminNotes(submission.admin_notes || '');
                    }}
                    className="text-red-600 hover:text-red-700 mr-3"
                  >
                    View
                  </button>
                  <select
                    value={submission.status}
                    onChange={(e) => updateStatus(submission.id, e.target.value)}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value="new">New</option>
                    <option value="read">Read</option>
                    <option value="responded">Responded</option>
                    <option value="archived">Archived</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold">Submission Details</h3>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="font-semibold">Name:</label>
                <p>{selectedSubmission.name}</p>
              </div>
              <div>
                <label className="font-semibold">Email:</label>
                <p>
                  <a href={`mailto:${selectedSubmission.email}`} className="text-red-600 hover:text-red-700">
                    {selectedSubmission.email}
                  </a>
                </p>
              </div>
              {selectedSubmission.phone && (
                <div>
                  <label className="font-semibold">Phone:</label>
                  <p>{selectedSubmission.phone}</p>
                </div>
              )}
              {selectedSubmission.specialty_interest && (
                <div>
                  <label className="font-semibold">Specialty Interest:</label>
                  <p>{selectedSubmission.specialty_interest}</p>
                </div>
              )}
              <div>
                <label className="font-semibold">Message:</label>
                <p className="whitespace-pre-wrap bg-gray-50 p-3 rounded">{selectedSubmission.message}</p>
              </div>
              <div>
                <label className="font-semibold block mb-2">Admin Notes:</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={4}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Add notes about this submission..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => saveNotes(selectedSubmission.id)}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  Save Notes
                </button>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
