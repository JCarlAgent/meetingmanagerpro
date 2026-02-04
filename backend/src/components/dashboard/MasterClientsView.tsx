import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { clearActingOrg, setActingOrg, useActingOrg } from '@/lib/actingOrg';
import { Building2, Users, ArrowRight, RefreshCw, UserPlus } from 'lucide-react';

type OrgRow = {
  id: string;
  name: string | null;
  slug: string | null;
  created_at: string;
};

type OrgMemberRow = {
  org_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

function isFmoRole(role: string | null | undefined) {
  return role === 'fmo_admin' || role === 'org_admin';
}

function isAdvisorRole(role: string | null | undefined) {
  return role === 'advisor' || role === 'member';
}

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

async function readResponseError(resp: Response): Promise<string> {
  const statusPart = `HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ''}`;
  let text = '';
  try {
    text = (await resp.text()).trim();
  } catch {
    // ignore
  }

  if (text) {
    try {
      const data = JSON.parse(text) as any;
      const msg = data?.error || data?.message;
      if (typeof msg === 'string' && msg.trim()) return `${msg} (${statusPart})`;
      return `${text.slice(0, 400)} (${statusPart})`;
    } catch {
      return `${text.slice(0, 400)} (${statusPart})`;
    }
  }

  return `Request failed (${statusPart})`;
}

function slugify(raw: string) {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

interface MasterClientsViewProps {
  onNavigate: (view: string) => void;
}

const MasterClientsView: React.FC<MasterClientsViewProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  const [isAddingIndependent, setIsAddingIndependent] = useState(false);
  const [advisorName, setAdvisorName] = useState('');
  const [advisorEmail, setAdvisorEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [openAfterCreate, setOpenAfterCreate] = useState(true);
  const [isSubmittingIndependent, setIsSubmittingIndependent] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [{ data: orgData, error: orgErr }, { data: memberData, error: memErr }] = await Promise.all([
        supabase.from('orgs').select('id, name, slug, created_at').order('created_at', { ascending: false }).limit(500),
        supabase
          .from('org_members')
          .select('org_id, user_id, role, created_at')
          .order('created_at', { ascending: false })
          .limit(5000),
      ]);

      if (orgErr) throw orgErr;
      if (memErr) throw memErr;

      setOrgs(((orgData ?? []) as unknown as OrgRow[]) || []);
      setMembers(((memberData ?? []) as unknown as OrgMemberRow[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load clients');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!success && !error) return;
    const t = setTimeout(() => {
      setSuccess(null);
      setError(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [success, error]);

  const rows = useMemo(() => {
    const byOrg = new Map<
      string,
      {
        org: OrgRow;
        fmoAdmins: number;
        advisors: number;
        membersTotal: number;
      }
    >();

    for (const org of orgs) {
      byOrg.set(org.id, {
        org,
        fmoAdmins: 0,
        advisors: 0,
        membersTotal: 0,
      });
    }

    for (const m of members) {
      const entry = byOrg.get(m.org_id);
      if (!entry) continue;
      entry.membersTotal += 1;
      if (isFmoRole(m.role)) entry.fmoAdmins += 1;
      if (isAdvisorRole(m.role)) entry.advisors += 1;
    }

    const list = Array.from(byOrg.values());
    list.sort((a, b) => {
      const aIsFmo = a.fmoAdmins > 0;
      const bIsFmo = b.fmoAdmins > 0;
      if (aIsFmo !== bIsFmo) return aIsFmo ? -1 : 1;
      return (a.org.name || '').localeCompare(b.org.name || '');
    });

    return list;
  }, [orgs, members]);

  const fmos = rows.filter((r) => r.fmoAdmins > 0);
  const independents = rows.filter((r) => r.fmoAdmins === 0 && r.advisors > 0);

  const addIndependentAdvisor = async () => {
    setError(null);
    setSuccess(null);

    const email = advisorEmail.trim();
    if (!email || !email.includes('@')) {
      setError('Enter a valid advisor email.');
      return;
    }

    const namePart = advisorName.trim();
    const defaultOrgName = namePart ? `${namePart} (Independent)` : `${email} (Independent)`;
    const nextOrgName = (orgName.trim() || defaultOrgName).trim();

    if (!nextOrgName) {
      setError('Enter a valid organization name.');
      return;
    }

    setIsSubmittingIndependent(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not logged in.');

      const slug = slugify(nextOrgName);
      if (!slug) throw new Error('Could not generate a valid slug from org name.');

      const createResp = await fetch('/api/admin/orgs/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: nextOrgName, slug }),
      });

      if (!createResp.ok) {
        throw new Error(await readResponseError(createResp));
      }

      const createData = (await createResp.json().catch(() => ({}))) as any;
      const createdOrgId = String(createData?.org?.id ?? '').trim();
      const createdOrgName = (createData?.org?.name as string | null) || nextOrgName;
      if (!createdOrgId) throw new Error('Org created but no org id returned.');

      const addResp = await fetch('/api/admin/orgs/addMember', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId: createdOrgId, email, role: 'advisor' }),
      });

      if (!addResp.ok) {
        throw new Error(await readResponseError(addResp));
      }

      const addData = (await addResp.json().catch(() => ({}))) as any;
      const invited = !!addData?.invited;

      setAdvisorName('');
      setAdvisorEmail('');
      setOrgName('');
      setIsAddingIndependent(false);

      setSuccess(invited ? `Invited and added independent advisor: ${email}` : `Added independent advisor: ${email}`);
      await load();

      if (openAfterCreate) {
        setActingOrg({ id: createdOrgId, name: createdOrgName });
        onNavigate('setup');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmittingIndependent(false);
    }
  };

  if (!user?.is_master_admin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
          <p className="mt-2 text-slate-600">This page is only available to master admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Clients</h1>
          <p className="text-slate-600 mt-1">FMOs first, then independent advisors. Select a client to onboard with master permissions.</p>
          {actingOrg?.id && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
              <span className="font-medium">Viewing as:</span>
              <span>{actingOrg.name || actingOrg.id}</span>
              <button
                type="button"
                onClick={() => clearActingOrg()}
                className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs hover:bg-amber-100"
              >
                Exit
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setIsAddingIndependent(true);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add independent advisor
          </button>

          <button
            type="button"
            onClick={load}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {(error || success) && (
        <div
          className={`mb-5 rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
        >
          {error || success}
        </div>
      )}

      {isAddingIndependent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => (!isSubmittingIndependent ? setIsAddingIndependent(false) : null)} />
          <div className="relative w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">Add independent advisor</div>
                <div className="mt-1 text-sm text-slate-600">Creates an org and adds the advisor by email.</div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingIndependent(false)}
                disabled={isSubmittingIndependent}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Advisor email</label>
                <input
                  value={advisorEmail}
                  onChange={(e) => setAdvisorEmail(e.target.value)}
                  placeholder="advisor@domain.com"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Advisor name (optional)</label>
                <input
                  value={advisorName}
                  onChange={(e) => {
                    setAdvisorName(e.target.value);
                    if (!orgName.trim()) {
                      const next = e.target.value.trim();
                      if (next) setOrgName(`${next} (Independent)`);
                    }
                  }}
                  placeholder="A. Jones"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Org name (optional)</label>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="A. Jones (Independent)"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
                <p className="mt-2 text-xs text-slate-500">If left blank, it auto-generates from name/email.</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={openAfterCreate}
                  onChange={(e) => setOpenAfterCreate(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Open dashboard after creating
              </label>

              <button
                type="button"
                onClick={addIndependentAdvisor}
                disabled={isSubmittingIndependent}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                {isSubmittingIndependent ? 'Adding…' : 'Create and invite/add'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-semibold text-slate-900">FMOs</h2>
            <span className="text-xs text-slate-500">({fmos.length})</span>
          </div>

          {isLoading ? (
            <div className="text-slate-500">Loading…</div>
          ) : fmos.length === 0 ? (
            <div className="text-slate-500">No FMOs found.</div>
          ) : (
            <div className="space-y-3">
              {fmos.map((r) => (
                <div key={r.org.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{r.org.name || r.org.slug || r.org.id}</div>
                      <div className="mt-1 text-xs text-slate-500">Org ID: {r.org.id}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                          <Users className="w-3 h-3" />
                          FMO admins: <span className="font-semibold">{r.fmoAdmins}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                          Advisors: <span className="font-semibold">{r.advisors}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                          Members: <span className="font-semibold">{r.membersTotal}</span>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActingOrg({ id: r.org.id, name: r.org.name });
                        onNavigate('setup');
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm font-semibold transition-colors"
                    >
                      Open dashboard
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-semibold text-slate-900">Independent Advisors</h2>
            <span className="text-xs text-slate-500">({independents.length})</span>
          </div>

          {isLoading ? (
            <div className="text-slate-500">Loading…</div>
          ) : independents.length === 0 ? (
            <div className="text-slate-500">No independent advisors found.</div>
          ) : (
            <div className="space-y-3">
              {independents.map((r) => (
                <div key={r.org.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{r.org.name || r.org.slug || r.org.id}</div>
                      <div className="mt-1 text-xs text-slate-500">Org ID: {r.org.id}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                          Advisors: <span className="font-semibold">{r.advisors}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                          Members: <span className="font-semibold">{r.membersTotal}</span>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActingOrg({ id: r.org.id, name: r.org.name });
                        onNavigate('setup');
                      }}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm font-semibold transition-colors"
                    >
                      Open dashboard
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default MasterClientsView;
