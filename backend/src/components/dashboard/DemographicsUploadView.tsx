import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useActingOrg } from '@/lib/actingOrg';
import { Upload, FileText, Plus, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { patchSetupState } from '@/lib/setupState';

type JobRow = {
  id: string;
  job_number: string;
  title: string | null;
  status: string;
  created_at: string;
};

type IngestResponse = {
  ok: boolean;
  jobId: string;
  storagePath: string;
  listId: string;
  rowsParsed: number;
  uniqueRecipients: number;
  duplicatesSkipped: number;
  recipientsUpserted: number;
  mailingsInserted: number;
  mailedAt: string;
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function formatJobLabel(job: JobRow) {
  const title = (job.title || '').trim();
  return title ? `${job.job_number} — ${title}` : job.job_number;
}

const DemographicsUploadView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  const [newJobTitle, setNewJobTitle] = useState('');
  const [isCreatingJob, setIsCreatingJob] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [mailedAt, setMailedAt] = useState<string>(() => {
    const d = new Date();
    // yyyy-mm-dd
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
  });

  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        success: boolean;
        message: string;
        details?: IngestResponse;
      }
  >(null);

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selectedJobId) || null, [jobs, selectedJobId]);

  const effectiveOrgId = user?.is_master_admin ? (actingOrg?.id ?? null) : (user?.org_id ?? null);

  if (user?.is_master_admin && !actingOrg?.id) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Demographics CSV</h1>
          <p className="text-slate-600 mt-2">Select a client first (Sidebar → Master → Clients).</p>
        </div>
      </div>
    );
  }

  const loadJobs = async () => {
    setIsLoadingJobs(true);
    try {
      let query = supabase
        .from('jobs')
        .select('id, job_number, title, status, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (effectiveOrgId) {
        query = query.eq('org_id', effectiveOrgId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setJobs(((data ?? []) as unknown as JobRow[]) || []);

      if (!selectedJobId && data && data.length) {
        setSelectedJobId(((data[0] as unknown as JobRow).id));
      }
    } catch (err: unknown) {
      setResult({ success: false, message: getErrorMessage(err) || 'Failed to load jobs' });
    } finally {
      setIsLoadingJobs(false);
    }
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('mmp_selected_job_id');
      if (stored && !selectedJobId) {
        setSelectedJobId(stored);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedJobId) return;
    try {
      window.localStorage.setItem('mmp_selected_job_id', selectedJobId);
    } catch {
      // ignore
    }
    patchSetupState({ selectedJobId });
  }, [selectedJobId]);

  const createJob = async () => {
    setResult(null);

    const orgId = effectiveOrgId;
    if (!orgId) {
      setResult({ success: false, message: 'No org found for your user. Ask an admin to add you to an org.' });
      return;
    }

    const title = newJobTitle.trim();
    if (!title) {
      setResult({ success: false, message: 'Enter a job title.' });
      return;
    }

    setIsCreatingJob(true);
    try {
      const { data: jobNumberData, error: allocErr } = await supabase.rpc('allocate_job_number', {
        p_org_id: orgId,
      });
      if (allocErr) throw allocErr;
      const jobNumber = String(jobNumberData ?? '');
      if (!jobNumber) throw new Error('Failed to allocate job number');

      const { data: inserted, error: insErr } = await supabase
        .from('jobs')
        .insert({
          org_id: orgId,
          created_by_user_id: user?.id,
          job_number: jobNumber,
          status: 'pending',
          title,
        })
        .select('id, job_number, title, status, created_at')
        .single();

      if (insErr) throw insErr;

      setNewJobTitle('');
      await loadJobs();
      setSelectedJobId((inserted as unknown as JobRow).id);
      setResult({ success: true, message: `Created job ${jobNumber}.` });
    } catch (err: unknown) {
      setResult({ success: false, message: getErrorMessage(err) || 'Failed to create job' });
    } finally {
      setIsCreatingJob(false);
    }
  };

  const uploadAndIngest = async () => {
    setResult(null);

    if (!selectedJobId) {
      setResult({ success: false, message: 'Select a job first.' });
      return;
    }

    if (!file) {
      setResult({ success: false, message: 'Choose a CSV file to upload.' });
      return;
    }

    const orgId = effectiveOrgId;
    if (!orgId) {
      setResult({ success: false, message: 'No org found for your user. Ask an admin to add you to an org.' });
      return;
    }

    console.log('[demographics] upload button/form submitted', { jobId: selectedJobId, filename: file.name });
    setStatusMessage('Uploading to storage...');
    setIsUploading(true);
    try {
      const fileExt = (file.name.split('.').pop() || 'csv').toLowerCase();
      const objectName = `${uuidv4()}.${fileExt}`;
      const storagePath = `orgs/${orgId}/jobs/${selectedJobId}/demographics/${objectName}`;

      console.log('[demographics] before Supabase storage upload', { storagePath, filename: file.name });

      const { error: uploadErr } = await supabase
        .storage
        .from('job-demographics')
        .upload(storagePath, file, {
          contentType: file.type || 'text/csv',
          upsert: false,
        });

      if (uploadErr) {
        console.log('[demographics] after Supabase storage upload error', uploadErr);
        setStatusMessage(`Upload failed: ${uploadErr.message || String(uploadErr)}`);
        throw new Error(uploadErr.message || 'Failed to upload to storage');
      }

      console.log('[demographics] after Supabase storage upload success', { storagePath });
      setStatusMessage('Storage upload complete. Ingesting...');

      const token = await getAccessToken();
      if (!token) {
        throw new Error('Not logged in. Please log in again.');
      }

      console.log('[demographics] before POST /api/jobs/demographics/ingest', { jobId: selectedJobId, storagePath });

      const resp = await fetch('/api/jobs/demographics/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: selectedJobId,
          storagePath,
          originalFilename: file.name,
          mailedAt: mailedAt ? new Date(`${mailedAt}T00:00:00Z`).toISOString() : undefined,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as unknown;
      console.log('[demographics] after ingest response received', { status: resp.status, ok: resp.ok, body: data });

      if (!resp.ok) {
        const message =
          typeof (data as { error?: unknown } | null)?.error === 'string'
            ? (data as { error: string }).error
            : 'Ingest failed';
        console.log('[demographics] after ingest error/catch', message);
        setStatusMessage(`Upload failed: ${message}`);
        throw new Error(message);
      }

      const ingest = data as IngestResponse;

      console.log('[demographics] after ingest success', ingest);
      setStatusMessage('Upload complete.');

      setFile(null);
      patchSetupState({ demographicsUploadedListName: file.name });
      setResult({
        success: true,
        message: `Ingested ${ingest.uniqueRecipients} unique recipients (${ingest.rowsParsed} rows parsed).`,
        details: ingest,
      });
    } catch (err: unknown) {
      console.log('[demographics] after ingest error/catch', err);
      setStatusMessage(`Upload failed: ${getErrorMessage(err)}`);
      setResult({ success: false, message: getErrorMessage(err) || 'Upload failed' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Demographics CSV</h1>
          <p className="text-slate-600 mt-1">
            Upload the mailing list for a job. We dedupe by address and record mailings so you can track “times mailed”.
          </p>
        </div>
        <button
          type="button"
          onClick={loadJobs}
          disabled={isLoadingJobs}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingJobs ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Job selection */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Job</label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            >
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {formatJobLabel(j)}
                </option>
              ))}
            </select>
            {selectedJob && (
              <p className="mt-2 text-xs text-slate-500">
                Status: <span className="font-medium">{selectedJob.status}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Mailed date</label>
            <input
              type="date"
              value={mailedAt}
              onChange={(e) => setMailedAt(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  console.log('[demographics] file selected', f?.name ?? null);
                  setFile(f);
                  setStatusMessage(f ? `File selected: ${f.name}` : 'No file selected');
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Choose CSV
              </button>
              <div className="text-sm">
                <p className="text-slate-900 font-medium">{file ? file.name : 'No file selected'}</p>
                {statusMessage && (
                  <p className="text-xs text-slate-600 mt-1">{statusMessage}</p>
                )}
                <p className="text-xs text-slate-500">
                  Headers supported: first/last name, address, city, state, zip (common variations).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={uploadAndIngest}
              disabled={isUploading || !selectedJobId || !file}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? 'Uploading…' : 'Upload + ingest'}
            </button>
          </div>

          {result && (
            <div
              className={`mt-4 rounded-lg border px-4 py-3 flex items-start gap-3 ${
                result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-700 mt-0.5" />
              )}
              <div>
                <p className={result.success ? 'text-green-900' : 'text-red-900'}>{result.message}</p>
                {result.details?.duplicatesSkipped != null && (
                  <p className="text-xs text-slate-600 mt-1">
                    Duplicates skipped: {result.details.duplicatesSkipped}. Mailings inserted: {result.details.mailingsInserted}.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick create job */}
      <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create a new job</h2>
        <p className="text-sm text-slate-600 mt-1">Fast path so you can attach a demographics list immediately.</p>

        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            value={newJobTitle}
            onChange={(e) => setNewJobTitle(e.target.value)}
            placeholder="Job title (example: Raleigh Dinner Seminar – March)"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
          <button
            type="button"
            onClick={createJob}
            disabled={isCreatingJob}
            className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {isCreatingJob ? 'Creating…' : 'Create job'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DemographicsUploadView;
