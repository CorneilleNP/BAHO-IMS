export type FacilityType = 'CWS' | 'HQ_DRY_MILL';

export interface Facility {
  id: string;
  facility_type: FacilityType;
  code: string;
  name: string;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  is_active: boolean;
}

export interface CropYear {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export type RoleCode =
  | 'ADMIN'
  | 'CWS_CLERK'
  | 'CWS_MANAGER'
  | 'HQ_FINANCE'
  | 'HQ_DRY_MILL_OPERATOR'
  | 'HQ_EXPORT_MANAGER';

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  is_active: boolean;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  facility_id: string | null;
}

export type AdminUnitLevel = 'PROVINCE' | 'DISTRICT' | 'SECTOR' | 'CELL' | 'VILLAGE';

export interface AdminUnit {
  id: string;
  parent_id: string | null;
  level: AdminUnitLevel;
  name: string;
}

export type Gender = 'M' | 'F' | 'OTHER';

export interface Farmer {
  id: string;
  farmer_code: string;
  full_name: string;
  gender?: Gender | null;
  national_id?: string | null;
  phone?: string | null;
  email?: string | null;
  village_id?: string | null;
  home_facility_id?: string | null;
  photo_url?: string | null;
  is_active: boolean;
}
