import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { setActingOrg, useActingOrg } from '@/lib/actingOrg';
import { Building2, Plus, RefreshCw, Users, Mail, Shield, UserPlus } from 'lucide-react';

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

type OrgMemberWithUser = OrgMemberRow & {
  user: {
    id: string;
    email: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    user_metadata: any;
    app_metadata: any;
  } | null;
};

type OrgOption = {
  id: string;
  name: string;
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

const MasterOrganizationsView: React.FC = () => {
  const { user } = useAuth();
  const { actingOrg, clearActingOrg } = useActingOrg();

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [members, setMembers] = useState<OrgMemberWithUser[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrgMemberWithUser | null>(null);

  const [fmoOrgOptions, setFmoOrgOptions] = useState<OrgOption[]>([]);
  const [transferTargetOrgId, setTransferTargetOrgId] = useState<string>('');
  const [transferMemberUserId, setTransferMemberUserId] = useState<string>('');
  const [removeFromSource, setRemoveFromSource] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [showAllOrgs, setShowAllOrgs] = useState(false);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'fmo_admin' | 'advisor'>('fmo_admin');
  const [isInviting, setIsInviting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [{ data: orgData, error: orgErr }, { data: fmoMembers, error: fmoErr }] = await Promise.all([
        supabase.from('orgs').select('id, name, slug, created_at').order('created_at', { ascending: false }).limit(500),
        supabase
          .from('org_members')
          .select('org_id, role')
          .in('role', ['fmo_admin', 'org_admin'])
          .limit(5000),
      ]);

      if (orgErr) throw orgErr;
      if (fmoErr) {
        // Non-fatal: still let the page work without the FMO dropdown.
        // eslint-disable-next-line no-console
        console.warn('Failed to load FMO org members for options', fmoErr);
      }

      const nextOrgs = ((orgData ?? []) as unknown as OrgRow[]) || [];
      setOrgs(nextOrgs);

      const fmoOrgIds = new Set<string>(((fmoMembers ?? []) as any[]).map((m) => String(m.org_id)));
      const nextFmoOptions: OrgOption[] = nextOrgs
        .filter((o) => fmoOrgIds.has(o.id))
        .map((o) => ({
          id: o.id,
          name: (o.name || o.slug || o.id) as string,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setFmoOrgOptions(nextFmoOptions);

      if (nextFmoOptions.length && !transferTargetOrgId) {
        setTransferTargetOrgId(nextFmoOptions[0].id);
      }

      const visibleOrgs = showAllOrgs ? nextOrgs : nextOrgs.filter((o) => fmoOrgIds.has(o.id));
      if (!selectedOrgId && visibleOrgs.length) {
        setSelectedOrgId(visibleOrgs[0].id);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (success || error) {
      const t = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [success, error]);

  const visibleOrgs = useMemo(() => {
    if (showAllOrgs) return orgs;
    const fmoIds = new Set(fmoOrgOptions.map((o) => o.id));
    return orgs.filter((o) => fmoIds.has(o.id));
  }, [orgs, showAllOrgs, fmoOrgOptions]);

  const selectedOrg = useMemo(() => visibleOrgs.find((o) => o.id === selectedOrgId) || null, [visibleOrgs, selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId) return;
    if (visibleOrgs.some((o) => o.id === selectedOrgId)) return;
    if (visibleOrgs.length) setSelectedOrgId(visibleOrgs[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAllOrgs, visibleOrgs.length]);

  const selectedMembers = useMemo(() => {
    return members;
  }, [members]);

  const loadMembers = async (orgId: string) => {
    setIsLoadingMembers(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not logged in.');

      const resp = await fetch('/api/admin/orgs/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId }),
      });

      if (!resp.ok) {
        throw new Error(await readResponseError(resp));
      }

      const data = (await resp.json().catch(() => ({}))) as any;
      setMembers(((data?.members ?? []) as unknown as OrgMemberWithUser[]) || []);
    } catch (err: unknown) {
      setMembers([]);
      setError(getErrorMessage(err) || 'Failed to load members');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (!selectedOrgId) {
      setMembers([]);
      setTransferMemberUserId('');
      return;
    }
    loadMembers(selectedOrgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  useEffect(() => {
    if (!members.length) {
      setTransferMemberUserId('');
      return;
    }
    const advisor = members.find((m) => m.role === 'advisor' || m.role === 'member');
    if (advisor?.user_id) setTransferMemberUserId(advisor.user_id);
  }, [members]);

  if (!user?.is_master_admin) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Organizations</h1>
          <p className="mt-2 text-slate-600">This page is only available to master admins.</p>
        </div>
      </div>
    );
  }

  const createOrg = async () => {
    setError(null);
    setSuccess(null);

    const name = newOrgName.trim();
    if (!name) {
      setError('Enter an organization name.');
      return;
    }

    const slug = slugify(newOrgSlug.trim() || name);
    if (!slug) {
      setError('Enter a valid slug (letters/numbers/dashes).');
      return;
    }

    setIsCreating(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not logged in.');

      const resp = await fetch('/api/admin/orgs/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, slug }),
      });

      if (!resp.ok) {
        throw new Error(await readResponseError(resp));
      }

      const data = (await resp.json().catch(() => ({}))) as any;

      setNewOrgName('');
      setNewOrgSlug('');
      setSuccess(`Created org: ${data?.org?.name || name}`);
      await load();
      if (data?.org?.id) setSelectedOrgId(data.org.id);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  const addMember = async () => {
    setError(null);
    setSuccess(null);

    if (!selectedOrgId) {
      setError('Select an organization first.');
      return;
    }

    const email = inviteEmail.trim();
    if (!email || !email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }

    setIsInviting(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not logged in.');

      const resp = await fetch('/api/admin/orgs/addMember', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId: selectedOrgId, email, role: inviteRole }),
      });

      if (!resp.ok) {
        throw new Error(await readResponseError(resp));
      }

      const data = (await resp.json().catch(() => ({}))) as any;

      setInviteEmail('');
      setSuccess(data?.invited ? `Invited and added: ${email}` : `Added: ${email}`);
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsInviting(false);
    }
  };

  const transferAdvisorToFmo = async () => {
    setError(null);
    setSuccess(null);

    if (!selectedOrgId) {
      setError('Select a source organization first.');
      return;
    }
    if (!transferMemberUserId) {
      setError('Select an advisor to transfer.');
      return;
    }
    if (!transferTargetOrgId) {
      setError('Select a destination FMO organization.');
      return;
    }
    if (selectedOrgId === transferTargetOrgId) {
      setError('Source and destination org must be different.');
      return;
    }

    setIsTransferring(true);
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
          fromOrgId: selectedOrgId,
          toOrgId: transferTargetOrgId,
          userId: transferMemberUserId,
          removeFromSource,
        }),
      });

      if (!resp.ok) {
        throw new Error(await readResponseError(resp));
      }

      const data = (await resp.json().catch(() => ({}))) as any;
      setSuccess(data?.removed ? 'Transferred advisor to destination org.' : 'Added advisor to destination org (kept in source org).');
      await loadMembers(selectedOrgId);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to transfer advisor');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Organizations</h1>
          <p className="text-slate-600 mt-1">Create FMOs and manage their members. (Independent advisors are managed under Clients.)</p>
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

      <label className="mb-5 inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={showAllOrgs}
          onChange={(e) => setShowAllOrgs(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Show all orgs (including independent advisors)
      </label>

      {(error || success) && (
        <div
          className={`mb-5 rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
        >
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-semibold text-slate-900">Create organization</h2>
          </div>

          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            value={newOrgName}
            onChange={(e) => {
              setNewOrgName(e.target.value);
              if (!newOrgSlug) {
                setNewOrgSlug(slugify(e.target.value));
              }
            }}
            placeholder="Acme FMO"
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />

          <label className="block text-sm font-medium text-slate-700 mt-4">Slug</label>
          <input
            value={newOrgSlug}
            onChange={(e) => setNewOrgSlug(e.target.value)}
            placeholder="acme-fmo"
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
          />
          <p className="mt-2 text-xs text-slate-500">Used for job numbers: <span className="font-mono">SLUG-000123</span></p>

          <button
            type="button"
            onClick={createOrg}
            disabled={isCreating}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            {isCreating ? 'Creating…' : 'Create org'}
          </button>
        </section>

        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-red-400" />
              <h2 className="text-lg font-semibold text-slate-900">Manage members</h2>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
              >
                <option value="">Select org…</option>
                {visibleOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name || o.slug || o.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedOrg ? (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{selectedOrg.name || selectedOrg.slug || selectedOrg.id}</div>
                  <div className="mt-1 text-xs text-slate-500">Org ID: {selectedOrg.id} • Slug: {selectedOrg.slug || '—'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActingOrg({ id: selectedOrg.id, name: selectedOrg.name })}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  View as org
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-slate-700">Add member by email</label>
                  <div className="mt-2 relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="advisor@client.com"
                      className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  >
                    <option value="fmo_admin">FMO Admin</option>
                    <option value="advisor">Advisor</option>
                  </select>
                </div>

                <div className="md:col-span-1">
                  <button
                    type="button"
                    onClick={addMember}
                    disabled={isInviting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-sm font-semibold transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    {isInviting ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-4 font-medium">User ID</th>
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 font-medium">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingMembers ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-slate-500">Loading members…</td>
                      </tr>
                    ) : selectedMembers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-4 text-slate-500">No members yet.</td>
                      </tr>
                    ) : (
                      selectedMembers.slice(0, 200).map((m) => (
                        <tr key={`${m.org_id}:${m.user_id}`} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-mono text-xs">
                            <button
                              type="button"
                              onClick={() => setSelectedMember(m)}
                              className="text-slate-900 hover:text-red-700 hover:underline"
                              title="View user details"
                            >
                              {m.user_id}
                            </button>
                          </td>
                          <td className="py-3 pr-4 text-slate-900">
                            {m.user?.email ? (
                              <span className="truncate inline-block max-w-[260px]">{m.user.email}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${m.role === 'fmo_admin' ? 'bg-red-500/10 text-red-700' : m.role === 'advisor' ? 'bg-blue-500/10 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                              {m.role === 'fmo_admin' ? <Shield className="w-3 h-3" /> : null}
                              {m.role}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-slate-600">{new Date(m.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Move independent advisor under an FMO</div>
                <div className="mt-1 text-xs text-slate-600">
                  This moves the advisor membership from this org to a destination FMO org. (It does not migrate jobs/meetings data between orgs.)
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-slate-700">Advisor</label>
                    <select
                      value={transferMemberUserId}
                      onChange={(e) => setTransferMemberUserId(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    >
                      <option value="">Select advisor…</option>
                      {selectedMembers
                        .filter((m) => m.role === 'advisor' || m.role === 'member')
                        .map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {(m.user?.email || m.user_id).slice(0, 80)}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700">Destination FMO org</label>
                    <select
                      value={transferTargetOrgId}
                      onChange={(e) => setTransferTargetOrgId(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    >
                      <option value="">Select destination…</option>
                      {(fmoOrgOptions.length ? fmoOrgOptions : orgs.map((o) => ({ id: o.id, name: (o.name || o.slug || o.id) as string })) ).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    {fmoOrgOptions.length === 0 && (
                      <div className="mt-1 text-xs text-amber-700">FMO list unavailable; showing all orgs.</div>
                    )}
                  </div>

                  <div className="md:col-span-1">
                    <button
                      type="button"
                      onClick={transferAdvisorToFmo}
                      disabled={isTransferring}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {isTransferring ? 'Moving…' : 'Move'}
                    </button>
                  </div>
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={removeFromSource}
                    onChange={(e) => setRemoveFromSource(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Remove from source org
                </label>
              </div>

              {selectedMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedMember(null)} />
                  <div className="relative w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-slate-900">User details</div>
                        <div className="mt-1 text-xs text-slate-500">Click outside to close</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMember(null)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-4 space-y-3 text-sm">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">User ID</div>
                        <div className="mt-1 font-mono text-xs text-slate-900 break-all">{selectedMember.user_id}</div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</div>
                          <div className="mt-1 text-slate-900 break-all">{selectedMember.user?.email || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</div>
                          <div className="mt-1 text-slate-900">{selectedMember.role}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Auth Created</div>
                          <div className="mt-1 text-slate-900">{selectedMember.user?.created_at ? new Date(selectedMember.user.created_at).toLocaleString() : '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Sign In</div>
                          <div className="mt-1 text-slate-900">{selectedMember.user?.last_sign_in_at ? new Date(selectedMember.user.last_sign_in_at).toLocaleString() : '—'}</div>
                        </div>
                      </div>

                      {selectedMember.user?.user_metadata && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Metadata</div>
                          <pre className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 overflow-auto max-h-48">
                            {JSON.stringify(selectedMember.user.user_metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-500">Select an org to manage members.</div>
          )}
        </section>
      </div>
    </div>
  );
};

export default MasterOrganizationsView;
