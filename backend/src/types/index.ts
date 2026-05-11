export interface User {
  id: string;
  email: string;
  company_name: string;
  industry: 'financial' | 'medicare' | 'stem_cell' | 'reverse_mortgage';
  phone: string;
  created_at: string;
  is_admin: boolean;

  // Multi-tenant / RBAC (optional until schema is fully wired)
  org_id?: string | null;
  org_role?: 'advisor' | 'member' | 'fmo_admin' | 'org_admin' | null;
  is_master_admin?: boolean;
}

export interface Campaign {
  id: string;
  user_id: string;
  project_id: string;
  status: 'pending' | 'active' | 'closed';
  mail_quantity: number;
  template_type: 'financial' | 'medicare' | 'stem_cell' | 'reverse_mortgage';
  mail_piece_size: string;
  mail_piece_type: string;
  toll_free_number: string;
  landing_page_url: string;
  artwork_status: 'pending' | 'approved' | 'revision';
  list_status: 'pending' | 'uploaded' | 'approved';
  prepped_status: boolean;
  produced_status: boolean;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
  events?: Event[];
  responders?: Responder[];
}

export interface Event {
  id: string;
  campaign_id: string;
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_state: string;
  event_date: string;
  event_time: string;
  event_type: string;
  max_capacity: number;
  status: 'open' | 'full' | 'closed';
  created_at: string;
  responders?: Responder[];
}

export interface Responder {
  id: string;
  campaign_id: string;
  event_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  guests: number;
  response_source: 'qr_code' | 'call_center' | 'manual';
  confirmed: boolean;
  attended: boolean;
  notes: string;
  income?: string;
  age?: string;
  ipa?: string;
  created_at: string;
  updated_at: string;
}

export interface DemographicList {
  id: string;
  campaign_id: string;
  file_name: string;
  record_count: number;
  uploaded_at: string;
}

export interface MailTemplate {
  id: string;
  org_id?: string | null;
  name: string;
  description: string;
  industry: 'financial' | 'medicare' | 'stem_cell' | 'reverse_mortgage';
  template_number: number;
  thumbnail_url: string | null;
  preview_url: string | null;
  mail_piece_size: string;
  mail_piece_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
