import React from 'react';

type LocationSummary = {
  label: string;
  value: string;
};

type TemplateSummary = {
  name: string;
  thumbnail_url?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
  locations: LocationSummary[];
  template: TemplateSummary | null;
  rsvpMethods: { call_center: boolean; qr_code: boolean };
  demographics:
    | { mode: 'printer'; notes?: string }
    | { mode: 'upload'; listName?: string };
};

const FinalizeSummaryModal: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  isConfirming,
  locations,
  template,
  rsvpMethods,
  demographics,
}) => {
  if (!open) return null;

  const rsvp = [
    rsvpMethods.call_center ? 'Call center' : null,
    rsvpMethods.qr_code ? 'QR code' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl border border-slate-200">
          <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Finalize summary</h2>
              <p className="text-sm text-slate-600 mt-1">Review the setup before launching.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            >
              Close
            </button>
          </div>

          <div className="p-5 space-y-5">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Locations</h3>
              {locations.length === 0 ? (
                <p className="text-sm text-slate-600 mt-2">No locations selected yet.</p>
              ) : (
                <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {locations.map((l) => (
                    <li key={l.label} className="text-sm text-slate-700">
                      <span className="text-slate-500">{l.label}: </span>
                      <span className="font-medium">{l.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Template</h3>
              {template ? (
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
                    {template.thumbnail_url ? (
                      <img src={template.thumbnail_url} alt={template.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-xs text-slate-400">No image</div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{template.name}</div>
                    <div className="text-xs text-slate-500">Selected template</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600 mt-2">No template selected yet.</p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">RSVP methods</h3>
              <p className="text-sm text-slate-700 mt-2">
                {rsvp.length ? rsvp.join(' + ') : 'None selected'}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Demographics</h3>
              {demographics.mode === 'printer' ? (
                <div className="mt-2">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Send to printer</span> (printer orders list)
                  </p>
                  {demographics.notes ? (
                    <p className="text-xs text-slate-500 mt-2">Notes: {demographics.notes}</p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">Upload own list</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-2">List: {demographics.listName || '(no list uploaded yet)'}</p>
                </div>
              )}
            </section>
          </div>

          <div className="p-5 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-lg transition-colors border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={Boolean(isConfirming)}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {isConfirming ? 'Saving…' : 'Confirm + save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinalizeSummaryModal;
