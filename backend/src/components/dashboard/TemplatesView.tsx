import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MailTemplate } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { Eye, FileImage, RefreshCw, Search, X } from 'lucide-react';

const INDUSTRIES: Array<{ value: MailTemplate['industry'] | 'all'; label: string }> = [
  { value: 'all', label: 'All industries' },
  { value: 'financial', label: 'Financial Planning' },
  { value: 'medicare', label: 'Medicare' },
  { value: 'stem_cell', label: 'Stem Cell Therapy' },
  { value: 'reverse_mortgage', label: 'Reverse Mortgage' },
];

const TemplatesView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrgId } = useActingOrg();
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [industry, setIndustry] = useState<(typeof INDUSTRIES)[number]['value']>('all');
  const [selected, setSelected] = useState<MailTemplate | null>(null);

  const effectiveOrgId = user?.is_master_admin ? actingOrgId : ((user as any)?.org_id ? String((user as any).org_id) : null);

  const fetchTemplates = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('mail_templates')
        .select('*')
        .eq('is_active', true)
        .order('industry', { ascending: true })
        .order('template_number', { ascending: true });

      if (effectiveOrgId) {
        query = query.eq('org_id', effectiveOrgId);
      } else {
        setTemplates([]);
        setError('No organization selected for templates.');
        setIsLoading(false);
        return;
      }

      const { data, error } = await query;

      if (error) {
        const code = (error as any)?.code;
        // Fallback for environments where org_id isn't added yet.
        if (code === '42703') {
          const fallback = await supabase
            .from('mail_templates')
            .select('*')
            .eq('is_active', true)
            .order('industry', { ascending: true })
            .order('template_number', { ascending: true });
          if (fallback.error) throw fallback.error;
          setTemplates((fallback.data || []) as MailTemplate[]);
          return;
        }
        throw error;
      }

      setTemplates((data || []) as MailTemplate[]);
    } catch (err: any) {
      setError(err?.message ? String(err.message) : 'Failed to load templates');
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templates.filter((t) => {
      if (industry !== 'all' && t.industry !== industry) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        String(t.template_number).includes(q)
      );
    });
  }, [templates, searchQuery, industry]);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <FileImage className="w-6 h-6 text-red-600" /> Templates
          </h1>
          <p className="text-sm text-slate-600 mt-1">Browse active mail pieces you can use in Meeting Setup.</p>
        </div>
        <button
          type="button"
          onClick={fetchTemplates}
          className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-2 rounded-lg transition-colors border border-slate-200"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates by name/description/#…"
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
          </div>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value as any)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          >
            {INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
      </div>

      {isLoading ? (
        <div className="text-slate-600">Loading templates…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center shadow-sm">
          <FileImage className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-slate-900 font-semibold">No templates found</div>
          <div className="text-slate-600 text-sm mt-1">Try changing your search or industry filter.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t)}
              className="text-left bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              <div className="aspect-video bg-slate-50 flex items-center justify-center overflow-hidden">
                {t.thumbnail_url ? (
                  <img src={t.thumbnail_url} alt={t.name} className="w-full h-full object-cover" />
                ) : (
                  <FileImage className="w-10 h-10 text-slate-300" />
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900 truncate">{t.name}</div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">#{t.template_number}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1 capitalize">{t.industry.replace('_', ' ')}</div>
                {t.description && (
                  <div className="text-sm text-slate-600 mt-2 line-clamp-2">{t.description}</div>
                )}
                <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-red-700">
                  <Eye className="w-4 h-4" /> Preview
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative bg-white rounded-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <div className="text-lg font-semibold text-slate-900">{selected.name}</div>
                <div className="text-sm text-slate-600 capitalize">{selected.industry.replace('_', ' ')} • Template #{selected.template_number}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-auto max-h-[calc(90vh-72px)]">
              {selected.preview_url || selected.thumbnail_url ? (
                <img
                  src={selected.preview_url || selected.thumbnail_url || ''}
                  alt={selected.name}
                  className="w-full h-auto rounded-xl border border-slate-200"
                />
              ) : (
                <div className="aspect-video bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center">
                  <div className="text-slate-500">No preview available</div>
                </div>
              )}

              {selected.description && (
                <div className="mt-4 text-sm text-slate-700">{selected.description}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplatesView;
