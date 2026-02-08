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

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

type IndependentAdvisorRow = {
  org: OrgRow;
  userId: string;
  role: string;
  addedAt: string;
  profile?: ProfileRow | null;
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

function displayAdvisorNameFromOrg(org: OrgRow): string {
  const base = (org.name || org.slug || '').trim();
  if (!base) return org.id;
  return base.replace(/\s*\(\s*independent\s*\)\s*/gi, '').trim() || base;
}

function displayAdvisorName(row: IndependentAdvisorRow): string {
  const full = (row.profile?.full_name || '').trim();
  if (full) return full;
  const email = (row.profile?.email || '').trim();
  if (email) return email;
  return displayAdvisorNameFromOrg(row.org);
}

async function fetchProfilesByUserId(userIds: string[]): Promise<Record<string, ProfileRow>> {
  const ids = Array.from(new Set(userIds.map((x) => String(x || '').trim()).filter(Boolean)));
  if (!ids.length) return {};

  const out: Record<string, ProfileRow> = {};
  const chunkSize = 500;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', chunk)
      .limit(chunkSize);

    if (error) throw error;
    for (const p of (data ?? []) as unknown as ProfileRow[]) {
      if (!p?.user_id) continue;
      out[p.user_id] = p;
    }
  }

  return out;
}

function shortId(id: string): string {
  if (!id) return '';
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-6)}`;
}

interface MasterClientsViewProps {
  onNavigate: (view: string) => void;
}

const MasterClientsView: React.FC<MasterClientsViewProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { actingOrg } = useActingOrg();

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRow>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  const [isAddingIndependent, setIsAddingIndependent] = useState(false);
  const [advisorName, setAdvisorName] = useState('');
  const [advisorEmail, setAdvisorEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [openAfterCreate, setOpenAfterCreate] = useState(true);
  const [isSubmittingIndependent, setIsSubmittingIndependent] = useState(false);

  const [isMovingAdvisor, setIsMovingAdvisor] = useState(false);
  const [moveSource, setMoveSource] = useState<IndependentAdvisorRow | null>(null);
  const [moveTargetOrgId, setMoveTargetOrgId] = useState<string>('');
  const [isSubmittingMove, setIsSubmittingMove] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const [{ data: orgData, error: orgErr }, { data: memberData, error: memErr }] = await Promise.all([
        supabase.from('orgs').select('id, name, slug, created_at').order('created_at', { ascending: false }).limit(2000),
        supabase
          .from('org_members')
          .select('org_id, user_id, role, created_at')
          .order('created_at', { ascending: false })
          .limit(20000),
      ]);

      if (orgErr) throw orgErr;
      if (memErr) throw memErr;

      const nextOrgs = ((orgData ?? []) as unknown as OrgRow[]) || [];
      const nextMembers = ((memberData ?? []) as unknown as OrgMemberRow[]) || [];

      setOrgs(nextOrgs);
      setMembers(nextMembers);

      // Best-effort: show advisor full name/email when profiles are available.
      try {
        const nextProfiles = await fetchProfilesByUserId(nextMembers.map((m) => m.user_id));
        setProfilesByUserId(nextProfiles);
      } catch (profileErr: any) {
        const code = profileErr?.code;
        if (code !== '42P01') {
          // eslint-disable-next-line no-console
          console.warn('Failed to load profiles for advisor names', profileErr);
        }
        setProfilesByUserId({});
      }
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

  const independentAdvisors = useMemo(() => {
    const byOrgId = new Map(orgs.map((o) => [o.id, o] as const));
    const fmoOrgIds = new Set(rows.filter((r) => r.fmoAdmins > 0).map((r) => r.org.id));

    const list: IndependentAdvisorRow[] = [];
    for (const m of members) {
      if (!isAdvisorRole(m.role)) continue;
      if (fmoOrgIds.has(m.org_id)) continue;
      const org = byOrgId.get(m.org_id);
      if (!org) continue;
      list.push({ org, userId: m.user_id, role: m.role, addedAt: m.created_at, profile: profilesByUserId[m.user_id] || null });
    }

    list.sort((a, b) => {
      const aName = displayAdvisorName(a).toLowerCase();
      const bName = displayAdvisorName(b).toLowerCase();
      if (aName !== bName) return aName.localeCompare(bName);
      return a.userId.localeCompare(b.userId);
    });

    return list;
  }, [members, orgs, rows, profilesByUserId]);

  const fmoOptions = useMemo(() => {
    return fmos
      .map((r) => ({ id: r.org.id, name: (r.org.name || r.org.slug || r.org.id) as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [fmos]);

  const addIndependentAdvisor = async () => {
    setError(null);
    setSuccess(null);

    const email = advisorEmail.trim();
    if (!email || !email.includes('@')) {
      setError('Enter a valid advisor email.');
      return;
    }

    const namePart = advisorName.trim();
    const nextOrgName = (orgName.trim() || namePart).trim();

    if (!nextOrgName) {
      setError('Enter the advisor full name.');
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
        setActingOrg({ id: createdOrgId, name: displayAdvisorNameFromOrg({ ...createData?.org, name: createdOrgName } as any) });
        onNavigate('home');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmittingIndependent(false);
    }
  };

  const beginMoveToFmo = (source: IndependentAdvisorRow) => {
    setError(null);
    setSuccess(null);
    setMoveSource(source);
    if (!moveTargetOrgId && fmoOptions.length) {
      setMoveTargetOrgId(fmoOptions[0].id);
    }
    setIsMovingAdvisor(true);
  };

  const moveAdvisorToFmo = async () => {
    setError(null);
    setSuccess(null);

    if (!moveSource) {
      setError('No advisor selected to move.');
      return;
    }
    if (!moveTargetOrgId) {
      setError('Select a destination FMO.');
      return;
    }
    if (moveSource.org.id === moveTargetOrgId) {
      setError('Source and destination must be different.');
      return;
    }

    setIsSubmittingMove(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not logged in.');

      const resp = await fetch('/api/admin/orgs/transferMember', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fromOrgId: moveSource.org.id,
          toOrgId: moveTargetOrgId,
          userId: moveSource.userId,
          removeFromSource: true,
        }),
      });

      if (!resp.ok) {
        throw new Error(await readResponseError(resp));
      }

      setIsMovingAdvisor(false);
      setMoveSource(null);
      setSuccess('Advisor moved under the selected FMO.');
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmittingMove(false);
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
                <label className="block text-sm font-medium text-slate-700">Advisor full name</label>
                <input
                  value={advisorName}
                  onChange={(e) => {
                    setAdvisorName(e.target.value);
                    if (!orgName.trim()) {
                      const next = e.target.value.trim();
                      if (next) setOrgName(next);
                    }
                  }}
                  placeholder="A. Jones"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Display name (optional override)</label>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="A. Jones"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
                <p className="mt-2 text-xs text-slate-500">This is what shows on the Clients list.</p>
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

      {isMovingAdvisor && moveSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => (!isSubmittingMove ? setIsMovingAdvisor(false) : null)} />
          <div className="relative w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">Move advisor under an FMO</div>
                <div className="mt-1 text-sm text-slate-600">
                  {displayAdvisorName(moveSource)} • Advisor ID: <span className="font-mono">{shortId(moveSource.userId)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMovingAdvisor(false)}
                disabled={isSubmittingMove}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Destination FMO</label>
                <select
                  value={moveTargetOrgId}
                  onChange={(e) => setMoveTargetOrgId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                >
                  <option value="">Select…</option>
                  {fmoOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                {fmoOptions.length === 0 && <div className="mt-2 text-xs text-amber-700">No FMOs found yet.</div>}
              </div>

              <button
                type="button"
                onClick={moveAdvisorToFmo}
                disabled={isSubmittingMove || fmoOptions.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {isSubmittingMove ? 'Moving…' : 'Move to FMO'}
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
                        onNavigate('home');
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
            <h2 className="text-lg font-semibold text-slate-900">Advisors</h2>
            <span className="text-xs text-slate-500">({independentAdvisors.length})</span>
          </div>

          {isLoading ? (
            <div className="text-slate-500">Loading…</div>
          ) : independentAdvisors.length === 0 ? (
            <div className="text-slate-500">No advisors found.</div>
          ) : (
            <div className="space-y-3">
              {independentAdvisors.map((r) => (
                <div key={`${r.org.id}:${r.userId}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{displayAdvisorName(r)}</div>
                      {r.profile?.email ? <div className="mt-1 text-xs text-slate-600">{r.profile.email}</div> : null}
                      <div className="mt-1 text-xs text-slate-500">Advisor ID: {shortId(r.userId)}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">Role: <span className="font-semibold">{r.role}</span></span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActingOrg({ id: r.org.id, name: displayAdvisorName(r) });
                          onNavigate('home');
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm font-semibold transition-colors"
                      >
                        Open dashboard
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => beginMoveToFmo(r)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 transition-colors"
                      >
                        Move to FMO
                      </button>
                    </div>
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
