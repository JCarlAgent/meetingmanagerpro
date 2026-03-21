import React from 'react';
import { X, ExternalLink, Info } from 'lucide-react';

interface OrderListModalProps {
  open: boolean;
  onClose: () => void;
  demographicsNotes: string;
}

export default function OrderListModal({ open, onClose, demographicsNotes }: OrderListModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50">
      <div className="m-auto flex w-[95vw] h-[90vh] max-w-7xl flex-col bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Order Mailing List</h2>
            <p className="text-sm text-slate-500">Provide these demographic requirements to the data source provider.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-slate-200 text-slate-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Split */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar with Demographics */}
          <div className="w-80 border-r border-slate-200 bg-white p-6 overflow-y-auto shrink-0 flex flex-col">
            <h3 className="font-semibold text-slate-900 mb-4">Target Audience</h3>
            <div className="flex-1 overflow-y-auto">
              {demographicsNotes ? (
                <div className="prose prose-sm text-slate-700 whitespace-pre-wrap">
                  {demographicsNotes}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  No demographic requirements generated yet. Use the AI Magic Query to create a campaign strategy first.
                </p>
              )}
            </div>
            
            <div className="pt-6 mt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-3">
                If the provider's website does not load below, you can open it in a separate tab.
              </p>
              <a 
                href="https://example.com" 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                Open Provider in New Tab <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Iframe Main Area */}
          <div className="flex-1 bg-slate-100 relative">
            <iframe 
               src="https://example.com" 
               title="Data Source Provider"
               className="absolute inset-0 w-full h-full border-0"
               sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
