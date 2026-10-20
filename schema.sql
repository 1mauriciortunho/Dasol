-- =============================================================
-- App Solidaria — Esquema de base de datos (PostgreSQL / Supabase)
-- Santa Cruz de la Sierra, Bolivia
--
-- MODELO DE DINERO: la app NO custodia ni procesa fondos.
-- Cada campaña muestra el QR Simple propio del organizador y la
-- gente aporta directo a esa cuenta. El monto recaudado lo reporta
-- el organizador (queda registrado en progress_updates) y un
-- trigger lo refleja en campaigns.current_amount.
--
-- FUENTE DE LA VERDAD: se recomienda que cada campaña use una
-- CUENTA BANCARIA DEDICADA. Así su saldo ES el total real (incluye
-- a quien deposita sin avisar) y el organizador reporta leyendo ese
-- saldo. Los avisos de pago con foto (payment_notifications) NO
-- definen el total: son prueba social y ayuda de conciliación.
-- =============================================================

-- ---------- EXTENSIONES ----------
create extension if not exists "pgcrypto";  -- para gen_random_uuid()

-- ---------- ENUMS ----------
create type user_role as enum ('user', 'moderator', 'admin');

create type campaign_category as enum (
  'salud',         -- tratamientos, cirugías, medicamentos
  'animales',      -- rescate / tratamiento de mascotas
  'desastre',      -- incendios, inundaciones
  'educacion',
  'funeral',
  'alimentacion',
  'otro'
);

create type campaign_status as enum (
  'borrador',      -- el organizador la está armando
  'en_revision',   -- enviada, esperando moderación (anti-fraude)
  'aprobada',      -- pública y activa
  'rechazada',
  'pausada',
  'completada',    -- llegó a la meta
  'expirada'       -- pasó la fecha límite
);

create type document_type as enum (
  'informe_medico',
  'documento_identidad',
  'factura_presupuesto',
  'informe_veterinario',
  'otro'
);

create type report_reason as enum (
  'fraude_sospechoso',
  'contenido_inapropiado',
  'duplicada',
  'ya_completada',
  'otro'
);

create type report_status as enum ('abierto', 'en_revision', 'resuelto', 'descartado');

-- Estado del aviso de pago que envía un donante (con foto de comprobante)
create type payment_notification_status as enum ('pendiente', 'confirmado', 'rechazado');

-- ---------- PERFILES ----------
-- Extiende auth.users de Supabase. Un mismo usuario puede ser
-- donante y organizador a la vez; "organizador" no es un rol,
-- es simplemente quien crea una campaña. role sólo distingue
-- moderadores/admins con permisos elevados.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  phone       text,                 -- contacto verificable (clave para confianza)
  avatar_url  text,
  role        user_role not null default 'user',
  is_verified boolean not null default false,  -- identidad verificada por el equipo
  created_at  timestamptz not null default now()
);

-- ---------- CAMPAÑAS ----------
create table campaigns (
  id                  uuid primary key default gen_random_uuid(),
  organizer_id        uuid not null references profiles (id) on delete cascade,
  title               text not null,
  slug                text not null unique,            -- para links compartibles
  story               text not null,                   -- la historia del caso
  category            campaign_category not null default 'otro',
  beneficiary_name    text,                            -- a quién se ayuda (si no es el organizador)

  -- Dinero: la app sólo lo refleja, no lo procesa
  goal_amount         numeric(12,2) not null check (goal_amount > 0),
  current_amount      numeric(12,2) not null default 0 check (current_amount >= 0),
  currency            char(3) not null default 'BOB',  -- bolivianos

  -- Pago directo al organizador vía su QR Simple
  qr_image_url        text,                            -- imagen del QR Simple del banco
  qr_bank_name        text,                            -- ej: 'BNB', 'Banco Unión', 'BMSC'
  account_holder_name text,                            -- titular de la cuenta (transparencia)

  -- Cuenta dedicada (recomendada): si la cuenta es exclusiva de la
  -- campaña, su saldo refleja el total real y habilita el badge
  -- "cuenta verificada" tras revisión del equipo.
  uses_dedicated_account     boolean not null default false,
  dedicated_account_verified boolean not null default false,  -- badge de confianza
  account_verified_by        uuid references profiles (id),
  account_verified_at        timestamptz,

  -- Multimedia
  cover_image_url     text,

  -- Moderación / anti-fraude
  status              campaign_status not null default 'borrador',
  rejection_reason    text,
  reviewed_by         uuid references profiles (id),
  reviewed_at         timestamptz,

  -- Contacto y contexto
  contact_phone       text,
  location            text not null default 'Santa Cruz de la Sierra',
  deadline            date,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------- GALERÍA DE IMÁGENES ----------
create table campaign_images (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  image_url   text not null,
  caption     text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- DOCUMENTOS DE VERIFICACIÓN (PRIVADOS) ----------
-- El corazón del control anti-fraude. Sólo visibles para el
-- organizador dueño y para moderadores (ver políticas RLS abajo).
create table verification_documents (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  doc_type    document_type not null default 'otro',
  file_url    text not null,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------- ACTUALIZACIONES DE PROGRESO ----------
-- Doble función:
--   1) el organizador reporta el nuevo total recaudado (new_total)
--   2) deja noticias para los donantes (update_text), p.ej.
--      "ya pagamos la primera quimio, ¡gracias a todos!"
-- Un trigger sincroniza campaigns.current_amount con el último new_total.
create table progress_updates (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  created_by  uuid references profiles (id),
  new_total   numeric(12,2) check (new_total >= 0),  -- null = sólo noticia, sin cambio de monto
  update_text text,
  image_url   text,
  created_at  timestamptz not null default now()
);

-- ---------- MENSAJES DE APOYO ----------
-- Prueba social y comunidad. self_reported_amount es SÓLO informativo:
-- NO afecta current_amount (sería manipulable). El monto oficial
-- proviene únicamente de progress_updates / el organizador.
create table support_messages (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references campaigns (id) on delete cascade,
  author_id            uuid references profiles (id) on delete set null,
  message              text not null,
  self_reported_amount numeric(12,2) check (self_reported_amount >= 0),
  is_anonymous         boolean not null default false,
  created_at           timestamptz not null default now()
);

-- ---------- AVISOS DE PAGO (CON COMPROBANTE) ----------
-- El donante avisa "ya pagué" y adjunta foto del comprobante.
-- IMPORTANTE: esto NO modifica current_amount (una captura editada
-- no debe inflar la barra). Sirve como prueba social y para que el
-- organizador concilie estos avisos contra los movimientos reales
-- de su cuenta dedicada antes de actualizar el total oficial.
create table payment_notifications (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  sender_id   uuid references profiles (id) on delete set null,  -- donante (si está logueado)
  sender_name text,                                              -- nombre a mostrar (opcional)
  amount      numeric(12,2) check (amount >= 0),                 -- monto declarado por el donante
  receipt_url text,                                              -- foto del comprobante
  message     text,                                              -- mensaje de apoyo opcional
  status      payment_notification_status not null default 'pendiente',
  reviewed_by uuid references profiles (id),                     -- organizador que confirma/rechaza
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- REPORTES / DENUNCIAS ----------
create table reports (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  reporter_id uuid references profiles (id) on delete set null,
  reason      report_reason not null default 'otro',
  details     text,
  status      report_status not null default 'abierto',
  resolved_by uuid references profiles (id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------- SEGUIMIENTO DE CAMPAÑAS ----------
-- Un usuario "sigue" una campaña para recibir sus actualizaciones.
create table campaign_follows (
  user_id     uuid not null references profiles (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, campaign_id)
);

-- ---------- ÍNDICES ----------
create index idx_campaigns_status_created on campaigns (status, created_at desc);
create index idx_campaigns_category       on campaigns (category);
create index idx_campaigns_organizer      on campaigns (organizer_id);
create index idx_images_campaign          on campaign_images (campaign_id);
create index idx_docs_campaign            on verification_documents (campaign_id);
create index idx_progress_campaign        on progress_updates (campaign_id, created_at desc);
create index idx_messages_campaign        on support_messages (campaign_id, created_at desc);
create index idx_payment_notif_campaign   on payment_notifications (campaign_id, created_at desc);
create index idx_payment_notif_status     on payment_notifications (campaign_id, status);
create index idx_reports_status           on reports (status);

-- ---------- TRIGGERS ----------
-- 1) Mantener updated_at en campañas
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_campaigns_updated_at
  before update on campaigns
  for each row execute function set_updated_at();

-- 2) Sincronizar el monto recaudado con la última actualización
--    y marcar la campaña como completada si alcanzó la meta.
create or replace function sync_campaign_amount()
returns trigger language plpgsql as $$
begin
  if new.new_total is not null then
    update campaigns
       set current_amount = new.new_total,
           status = case
                      when new.new_total >= goal_amount and status = 'aprobada'
                      then 'completada'
                      else status
                    end
     where id = new.campaign_id;
  end if;
  return new;
end $$;

create trigger trg_progress_sync_amount
  after insert on progress_updates
  for each row execute function sync_campaign_amount();

-- 3) Crear el perfil automáticamente al registrarse un usuario.
--    full_name y phone llegan en raw_user_meta_data desde el signUp del
--    cliente (options.data). El cliente NO inserta en profiles: lo hace este
--    trigger. security definer para poder escribir en public.profiles.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'Usuario'),
    nullif(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 4) Proteger columnas sensibles (ver db/migrations/012). Las políticas de
--    UPDATE filtran filas, no columnas: sin esto el organizador podría
--    auto-aprobarse o tocar current_amount, y un usuario cambiarse el role.
--    current_amount sólo cambia desde sync_campaign_amount (pg_trigger_depth() > 1).
--    Cambios críticos (cuenta/QR, meta, beneficiario) de una campaña aprobada
--    la devuelven a en_revision; cambiar la cuenta quita el badge (ver 013).
--    Desde el SQL Editor (auth.uid() nulo) no se restringe.
create or replace function guard_campaign_columns()
returns trigger language plpgsql as $$
declare
  account_changed boolean;
  critical_changed boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.current_amount := 0;
    new.dedicated_account_verified := false;
    new.account_verified_by := null;
    new.account_verified_at := null;
    new.rejection_reason := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    if not is_moderator() and new.status not in ('borrador', 'en_revision') then
      new.status := 'en_revision';
    end if;
    return new;
  end if;

  -- UPDATE que viene del trigger de progress_updates: es la vía legítima
  -- para current_amount y para pasar a 'completada'.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.current_amount is distinct from old.current_amount then
    raise exception 'El monto recaudado sólo cambia con un reporte de avance';
  end if;

  if new.organizer_id is distinct from old.organizer_id then
    raise exception 'No se puede cambiar el organizador de una campaña';
  end if;

  if is_moderator() then
    return new;
  end if;

  if new.status                     is distinct from old.status
  or new.rejection_reason           is distinct from old.rejection_reason
  or new.reviewed_by                is distinct from old.reviewed_by
  or new.reviewed_at                is distinct from old.reviewed_at
  or new.dedicated_account_verified is distinct from old.dedicated_account_verified
  or new.account_verified_by        is distinct from old.account_verified_by
  or new.account_verified_at        is distinct from old.account_verified_at
  then
    raise exception 'Sólo un moderador puede cambiar el estado o la verificación de una campaña';
  end if;

  account_changed :=
       new.qr_image_url           is distinct from old.qr_image_url
    or new.qr_bank_name           is distinct from old.qr_bank_name
    or new.account_holder_name    is distinct from old.account_holder_name
    or new.uses_dedicated_account is distinct from old.uses_dedicated_account;

  critical_changed := account_changed
    or new.goal_amount      is distinct from old.goal_amount
    or new.beneficiary_name is distinct from old.beneficiary_name;

  if account_changed then
    new.dedicated_account_verified := false;
    new.account_verified_by := null;
    new.account_verified_at := null;
  end if;

  if critical_changed and old.status in ('aprobada', 'completada') then
    new.status := 'en_revision';
    new.reviewed_by := null;
    new.reviewed_at := null;
  end if;

  return new;
end $$;

drop trigger if exists trg_campaigns_guard on campaigns;
create trigger trg_campaigns_guard
  before insert or update on campaigns
  for each row execute function guard_campaign_columns();

-- 5) El role de un perfil sólo lo cambia un admin (o el SQL Editor).
create or replace function guard_profile_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not exists (
       select 1 from profiles where id = auth.uid() and role = 'admin'
     ) then
    raise exception 'Sólo un admin puede cambiar roles';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard_role on profiles;
create trigger trg_profiles_guard_role
  before update on profiles
  for each row execute function guard_profile_role();

-- 6) Avisos de pago: confirmar/rechazar sólo cambia el status; nadie edita
--    lo que declaró el donante (monto, comprobante). Ver 013.
create or replace function guard_payment_notification()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.campaign_id is distinct from old.campaign_id
  or new.sender_id   is distinct from old.sender_id
  or new.sender_name is distinct from old.sender_name
  or new.amount      is distinct from old.amount
  or new.receipt_url is distinct from old.receipt_url
  or new.message     is distinct from old.message
  or new.created_at  is distinct from old.created_at
  then
    raise exception 'Los datos de un aviso de pago no se pueden editar; sólo se confirma o rechaza';
  end if;

  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end $$;

drop trigger if exists trg_payment_notifications_guard on payment_notifications;
create trigger trg_payment_notifications_guard
  before update on payment_notifications
  for each row execute function guard_payment_notification();

-- ---------- ROW LEVEL SECURITY (RLS) ----------
-- Supabase recomienda RLS en todas las tablas. Estas políticas son
-- un punto de partida sensato — revisalas bien antes de producción,
-- sobre todo porque es una app que toca confianza y reputación.

alter table profiles               enable row level security;
alter table campaigns              enable row level security;
alter table campaign_images        enable row level security;
alter table verification_documents enable row level security;
alter table progress_updates       enable row level security;
alter table support_messages       enable row level security;
alter table payment_notifications  enable row level security;
alter table reports                enable row level security;
alter table campaign_follows       enable row level security;

-- Helper: ¿el usuario actual es moderador o admin?
create or replace function is_moderator()
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('moderator', 'admin')
  );
$$;

-- PERFILES
create policy "perfiles_lectura_publica" on profiles
  for select using (true);
create policy "perfiles_editar_propio" on profiles
  for update using (id = auth.uid());

-- CAMPAÑAS: el público sólo ve las aprobadas/completadas; el
-- organizador ve las suyas en cualquier estado; los moderadores ven todo.
create policy "campanas_lectura" on campaigns
  for select using (
    status in ('aprobada', 'completada')
    or organizer_id = auth.uid()
    or is_moderator()
  );
create policy "campanas_crear" on campaigns
  for insert with check (organizer_id = auth.uid());
create policy "campanas_editar" on campaigns
  for update using (organizer_id = auth.uid() or is_moderator());

-- DOCUMENTOS DE VERIFICACIÓN (privados): sólo dueño o moderador
create policy "docs_lectura_restringida" on verification_documents
  for select using (
    is_moderator()
    or exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.organizer_id = auth.uid()
    )
  );
create policy "docs_subir" on verification_documents
  for insert with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.organizer_id = auth.uid()
    )
  );

-- ACTUALIZACIONES E IMÁGENES: lectura pública, las gestiona el organizador
create policy "progreso_lectura" on progress_updates
  for select using (true);
create policy "progreso_crear" on progress_updates
  for insert with check (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.organizer_id = auth.uid()
    )
  );
create policy "imagenes_lectura" on campaign_images
  for select using (true);
create policy "imagenes_gestion" on campaign_images
  for all using (
    exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.organizer_id = auth.uid()
    )
  );

-- MENSAJES DE APOYO: lectura pública, escritura autenticada
create policy "mensajes_lectura" on support_messages
  for select using (true);
create policy "mensajes_crear" on support_messages
  for insert with check (author_id = auth.uid());

-- AVISOS DE PAGO: privados (la foto puede tener datos sensibles).
-- Los ve el donante que lo envió, el organizador de la campaña y los
-- moderadores. Sólo el organizador o un moderador puede confirmarlos.
create policy "avisos_lectura" on payment_notifications
  for select using (
    sender_id = auth.uid()
    or is_moderator()
    or exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.organizer_id = auth.uid()
    )
  );
create policy "avisos_crear" on payment_notifications
  for insert with check (sender_id = auth.uid());
create policy "avisos_revisar" on payment_notifications
  for update using (
    is_moderator()
    or exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.organizer_id = auth.uid()
    )
  );

-- REPORTES: los crea cualquier usuario autenticado; sólo moderadores los leen
create policy "reportes_crear" on reports
  for insert with check (reporter_id = auth.uid());
create policy "reportes_leer_mod" on reports
  for select using (is_moderator());
create policy "reportes_actualizar_mod" on reports
  for update using (is_moderator());

-- SEGUIMIENTOS: cada quien gestiona los suyos
create policy "follows_propio" on campaign_follows
  for all using (user_id = auth.uid());

-- ---------- EXPONER TABLAS A LA DATA API (GRANTS) ----------
-- El proyecto de Supabase tiene DESACTIVADO "exponer nuevas tablas
-- automáticamente", así que PostgREST no ve estas tablas hasta que les
-- otorguemos privilegios a los roles de la API de forma explícita.
--
-- IMPORTANTE: la RLS de arriba sigue siendo el control real. Estos GRANT
-- sólo permiten que la API "vea" la tabla; las políticas deciden qué filas
-- y operaciones se permiten de verdad (sin política que aplique, se niega).
-- Por eso 'anon' sólo recibe SELECT (lectura del feed/detalle, ya filtrada
-- por RLS a campañas aprobadas) y la escritura queda para 'authenticated'.
grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Si más adelante agregás tablas con auto-expose off, repetí el GRANT
-- correspondiente para ellas (o exponelas desde el panel).

-- ---------- POLÍTICAS DE STORAGE (subida de imágenes) ----------
-- Storage tiene su propia RLS sobre storage.objects. Los buckets nuevos no
-- traen políticas, así que un usuario autenticado no puede subir hasta
-- definirlas. Buckets ya creados desde el panel:
--   campaign-images (público), verification-docs y payment-receipts (privados).
--
-- Acá sólo habilitamos la SUBIDA (insert) para usuarios autenticados. La
-- lectura de los privados (panel de moderación) se resolverá en ese paso con
-- URLs firmadas / políticas de select para dueño y moderadores. El bucket
-- público sirve sus archivos sin RLS, así que la portada/QR se ven sin más.

create policy "subir_portada_qr" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'campaign-images');

create policy "subir_comprobante" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-receipts');

create policy "subir_documento_verificacion" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification-docs');
