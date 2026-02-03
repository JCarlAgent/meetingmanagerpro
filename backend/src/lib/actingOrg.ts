import { useEffect, useState } from 'react';

export type ActingOrg = {
  id: string;
  name?: string | null;
};

const KEY_ID = 'mmp_acting_org_id';
const KEY_NAME = 'mmp_acting_org_name';
const EVT = 'mmp_acting_org_changed';

function notify() {
  try {
    window.dispatchEvent(new Event(EVT));
  } catch {
    // ignore
  }
}

export function getActingOrg(): ActingOrg | null {
  try {
    const id = window.localStorage.getItem(KEY_ID);
    if (!id) return null;
    const name = window.localStorage.getItem(KEY_NAME);
    return { id, name };
  } catch {
    return null;
  }
}

export function setActingOrg(org: ActingOrg) {
  try {
    window.localStorage.setItem(KEY_ID, org.id);
    if (org.name !== undefined) {
      window.localStorage.setItem(KEY_NAME, org.name ?? '');
    }
  } catch {
    // ignore
  }
  notify();
}

export function clearActingOrg() {
  try {
    window.localStorage.removeItem(KEY_ID);
    window.localStorage.removeItem(KEY_NAME);
  } catch {
    // ignore
  }
  notify();
}

export function useActingOrg() {
  const [actingOrg, setActingOrgState] = useState<ActingOrg | null>(() => getActingOrg());

  useEffect(() => {
    const handler = () => setActingOrgState(getActingOrg());
    window.addEventListener(EVT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return {
    actingOrg,
    actingOrgId: actingOrg?.id ?? null,
    setActingOrg,
    clearActingOrg,
  };
}
