-- 0001_core_schema.sql
-- Identity, org structure, address hierarchy, farmers.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ROLES (lookup, admin-editable — not a hardcoded application enum)
create table roles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  is_active boolean not null default true
);

insert into roles (code, name) values
  ('ADMIN', 'Administrator'),
  ('CWS_CLERK', 'CWS Data Clerk'),
  ('CWS_MANAGER', 'CWS Manager'),
  ('HQ_FINANCE', 'HQ Finance'),
  ('HQ_DRY_MILL_OPERATOR', 'HQ Dry Mill Operator'),
  ('HQ_EXPORT_MANAGER', 'HQ Export Manager');

-- CROP YEARS
create table crop_years (
  id uuid primary key default gen_random_uuid(),
  label text unique not null,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- FACILITIES: unifies CWS stations and the HQ dry mill as one concept
-- so stock movement / transfer logic is generic across the whole chain.
create type facility_type as enum ('CWS', 'HQ_DRY_MILL');

create table facilities (
  id uuid primary key default gen_random_uuid(),
  facility_type facility_type not null,
  code text unique not null,
  name text not null,
  district text,
  sector text,
  cell text,
  village text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_facilities_updated_at before update on facilities
  for each row execute function set_updated_at();

-- USERS mirrors auth.users (Supabase Auth) by shared id.
create table users (
  id uuid primary key,
  full_name text not null,
  email text unique,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

-- A user can hold multiple roles, each optionally scoped to a facility.
-- facility_id null = global/HQ scope (sees all stations).
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id),
  facility_id uuid references facilities(id),
  created_at timestamptz not null default now(),
  unique (user_id, role_id, facility_id)
);
create index idx_user_roles_user on user_roles(user_id);
create index idx_user_roles_facility on user_roles(facility_id);

-- ADMIN UNITS: Rwanda address hierarchy (Province > District > Sector > Cell > Village)
-- as a self-referencing tree instead of five hardcoded text columns, so
-- data entry gets autocomplete and typo-free consistent village names.
create type admin_unit_level as enum ('PROVINCE','DISTRICT','SECTOR','CELL','VILLAGE');

create table admin_units (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references admin_units(id),
  level admin_unit_level not null,
  name text not null,
  created_at timestamptz not null default now()
);
create index idx_admin_units_parent on admin_units(parent_id);
create index idx_admin_units_level_name on admin_units(level, name);

-- FARMERS
create type gender as enum ('M','F','OTHER');

create table farmers (
  id uuid primary key default gen_random_uuid(),
  farmer_code text unique not null,
  full_name text not null,
  gender gender,
  national_id text,
  phone text,
  email text,
  village_id uuid references admin_units(id),
  home_facility_id uuid references facilities(id),
  photo_url text,
  is_active boolean not null default true,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references users(id),
  device_id text,
  is_deleted boolean not null default false
);
create trigger trg_farmers_updated_at before update on farmers
  for each row execute function set_updated_at();
create index idx_farmers_national_id on farmers(national_id) where national_id is not null;
create index idx_farmers_home_facility on farmers(home_facility_id);
create index idx_farmers_full_name on farmers(full_name);
