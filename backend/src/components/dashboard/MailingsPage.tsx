import React from 'react';
import MailingsOverview from './MailingsOverview';
import PurchasedListsView from './PurchasedListsView';
import RecipientsHistoryView from './RecipientsHistoryView';
import SuppressionsView from './SuppressionsView';
import BuildListPreview from './BuildListPreview';

const MailingsPage: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mailings</h1>
          <p className="text-slate-600 mt-1">Every mailing makes the system smarter — overview and history.</p>
        </div>
      </div>

      <MailingsOverview />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Purchased Lists</h2>
          <PurchasedListsView />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Build Next List (Preview)</h2>
          <BuildListPreview />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Recipient History</h2>
          <RecipientsHistoryView />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Suppressions</h2>
          <SuppressionsView />
        </div>
      </div>
    </div>
  );
};

export default MailingsPage;
