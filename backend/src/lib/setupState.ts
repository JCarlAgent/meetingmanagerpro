export type RsvpMethod = 'call_center' | 'qr_code';

export type DemographicsMode = 'printer' | 'upload';

export type SetupState = {
  selectedJobId?: string;
  rsvpMethods?: Record<RsvpMethod, boolean>;
  demographicsNotes?: string;
  demographicsMode?: DemographicsMode;
  demographicsUploadedListName?: string;
};

const KEY = 'mmp_setup_state_v1';

export function loadSetupState(): SetupState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SetupState;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function saveSetupState(next: SetupState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function patchSetupState(patch: Partial<SetupState>) {
  const current = loadSetupState();
  saveSetupState({ ...current, ...patch });
}
