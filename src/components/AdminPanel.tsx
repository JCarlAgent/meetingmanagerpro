import React, { useState } from 'react';
import { useContent } from '../context/ContentContext';

interface AdminPanelProps {
  isStandalone?: boolean;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isStandalone = false }) => {
  const { isAdminMode, content, updateContent } = useContent();
  const [activeTab, setActiveTab] = useState<'home' | 'contact' | 'mission' | 'specialty'>('home');

  // If not standalone (sidebar mode), check admin mode
  if (!isStandalone && !isAdminMode) return null;

  const containerClass = isStandalone 
    ? "bg-white rounded-lg shadow-lg p-6" 
    : "fixed right-0 top-20 bottom-0 w-96 bg-white shadow-2xl border-l border-gray-200 overflow-y-auto z-40";

  return (
    <div className={containerClass}>

      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Admin Panel</h2>
        <p className="text-sm text-gray-600 mb-6">Click on any text to edit inline, or use the forms below.</p>

        <div className="flex flex-wrap gap-2 mb-6">
          <button 
            onClick={() => setActiveTab('home')}
            className={`px-4 py-2 rounded text-sm ${activeTab === 'home' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            Home
          </button>
          <button 
            onClick={() => setActiveTab('contact')}
            className={`px-4 py-2 rounded text-sm ${activeTab === 'contact' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            Contact
          </button>
          <button 
            onClick={() => setActiveTab('mission')}
            className={`px-4 py-2 rounded text-sm ${activeTab === 'mission' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            Mission
          </button>
          <button 
            onClick={() => setActiveTab('specialty')}
            className={`px-4 py-2 rounded text-sm ${activeTab === 'specialty' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            Specialties
          </button>
        </div>


        {activeTab === 'home' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hero Title</label>
              <input 
                type="text"
                value={content.home.hero.title}
                onChange={(e) => updateContent('home.hero.title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hero Subtitle</label>
              <textarea 
                value={content.home.hero.subtitle}
                onChange={(e) => updateContent('home.hero.subtitle', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CTA Button Text</label>
              <input 
                type="text"
                value={content.home.hero.ctaText}
                onChange={(e) => updateContent('home.hero.ctaText', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
          </div>
        )}

        {activeTab === 'contact' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Page Title</label>
              <input 
                type="text"
                value={content.contact.title}
                onChange={(e) => updateContent('contact.title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
              <input 
                type="text"
                value={content.contact.subtitle}
                onChange={(e) => updateContent('contact.subtitle', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body Text</label>
              <textarea 
                value={content.contact.body}
                onChange={(e) => updateContent('contact.body', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <input
                type="email"
                value={content.contact.email}
                onChange={(e) => updateContent('contact.email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
              <input
                type="text"
                value={content.contact.phone || ''}
                onChange={(e) => updateContent('contact.phone', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
          </div>
        )}

        {activeTab === 'mission' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Page Title</label>
              <input 
                type="text"
                value={content.mission.title}
                onChange={(e) => updateContent('mission.title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
              <input 
                type="text"
                value={content.mission.subtitle}
                onChange={(e) => updateContent('mission.subtitle', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body Text</label>
              <textarea 
                value={content.mission.body}
                onChange={(e) => updateContent('mission.body', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded"
                rows={6}
              />
            </div>
          </div>
        )}

        {activeTab === 'specialty' && (
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h3 className="font-semibold text-lg mb-3">Financial Planners</h3>
              <div className="space-y-3">
                <input 
                  type="text"
                  value={content.financialPlanners.title}
                  onChange={(e) => updateContent('financialPlanners.title', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="Title"
                />
                <input 
                  type="text"
                  value={content.financialPlanners.subtitle}
                  onChange={(e) => updateContent('financialPlanners.subtitle', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="Subtitle"
                />
                <textarea 
                  value={content.financialPlanners.body}
                  onChange={(e) => updateContent('financialPlanners.body', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                  rows={3}
                />
              </div>
            </div>
            
            <div className="border-b pb-4">
                <h3 className="font-semibold text-lg mb-3">Medicare</h3>
              <div className="space-y-3">
                <input 
                  type="text"
                  value={content.medicare.title}
                  onChange={(e) => updateContent('medicare.title', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
                <input 
                  type="text"
                  value={content.medicare.subtitle}
                  onChange={(e) => updateContent('medicare.subtitle', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
                <textarea 
                  value={content.medicare.body}
                  onChange={(e) => updateContent('medicare.body', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                  rows={3}
                />
              </div>
            </div>
            
            <div className="border-b pb-4">
                <h3 className="font-semibold text-lg mb-3">Stem Cell</h3>
              <div className="space-y-3">
                <input 
                  type="text"
                  value={content.stemCell.title}
                  onChange={(e) => updateContent('stemCell.title', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
                <input 
                  type="text"
                  value={content.stemCell.subtitle}
                  onChange={(e) => updateContent('stemCell.subtitle', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
                <textarea 
                  value={content.stemCell.body}
                  onChange={(e) => updateContent('stemCell.body', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                  rows={3}
                />
              </div>
            </div>
            
            <div className="pb-4">
              <h3 className="font-semibold text-lg mb-3">Reverse Mortgage</h3>
              <div className="space-y-3">
                <input 
                  type="text"
                  value={content.reverseMortgage.title}
                  onChange={(e) => updateContent('reverseMortgage.title', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
                <input 
                  type="text"
                  value={content.reverseMortgage.subtitle}
                  onChange={(e) => updateContent('reverseMortgage.subtitle', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
                <textarea 
                  value={content.reverseMortgage.body}
                  onChange={(e) => updateContent('reverseMortgage.body', e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                  rows={3}
                />
              </div>
            </div>
          </div>

        )}

        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-800">
            💾 Changes are saved automatically to the database
          </p>
        </div>

      </div>
    </div>
  );
};
