import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPanel } from '../components/AdminPanel';
import { AdminContactSubmissions } from '../components/AdminContactSubmissions';
import { supabase } from '@/lib/supabase';

export const AdminPanelPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'content' | 'submissions'>('content');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/admin-login');
        return;
      }

      // Verify the signed-in user's email is listed in the admins table
      const userEmail = session.user?.email;
      if (!userEmail) {
        await supabase.auth.signOut();
        navigate('/admin-login');
        return;
      }

      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('email')
        .eq('email', userEmail)
        .limit(1)
        .maybeSingle();

      if (adminError) {
        console.error('Error checking admin list:', adminError);
        // Fail closed: sign out and redirect
        await supabase.auth.signOut();
        navigate('/admin-login');
        return;
      }

      if (!adminData) {
        // Not in admins list
        await supabase.auth.signOut();
        navigate('/admin-login');
        return;
      }
    } catch (error) {
      console.error('Auth check error:', error);
      navigate('/admin-login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex gap-4 border-b">
          <button
            onClick={() => setActiveTab('content')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'content'
                ? 'border-b-2 border-red-600 text-red-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Content Management
          </button>
          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'submissions'
                ? 'border-b-2 border-red-600 text-red-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Contact Submissions
          </button>
        </div>

        {activeTab === 'content' && <AdminPanel isStandalone={true} />}
        {activeTab === 'submissions' && <AdminContactSubmissions />}
      </div>
    </div>
  );
};
