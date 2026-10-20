-- 012 · Proteger columnas sensibles de campañas y perfiles
-- Las políticas de UPDATE ("campanas_editar", "perfiles_editar_propio") filtran
-- FILAS pero no COLUMNAS: el organizador podía cambiar desde la API el status
-- de su campaña (auto-aprobarse), current_amount o el badge de cuenta
-- verificada, y cualquier usuario podía cambiarse su propio role a 'admin'.
-- Estos triggers cierran eso del lado del servidor, aunque alguien saltee la app.
-- Desde el SQL Editor (auth.uid() nulo) no se restringe nada, para que las
-- operaciones manuales como la 004 sigan funcionando. Idempotente.

-- ---------- Parte 1: campañas ----------
-- Reglas:
--   · current_amount sólo cambia vía el trigger de progress_updates
--     (pg_trigger_depth() > 1 = el update viene de sync_campaign_amount).
--   · organizer_id no se reasigna nunca desde la API.
--   · Moderación y badge de cuenta verificada: sólo moderadores.
--   · Al crear: nace con monto 0, sin verificaciones, en borrador/en_revision.
create or replace function guard_campaign_columns()
returns trigger language plpgsql as $$
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

  if not is_moderator() and (
       new.status                     is distinct from old.status
    or new.rejection_reason           is distinct from old.rejection_reason
    or new.reviewed_by                is distinct from old.reviewed_by
    or new.reviewed_at                is distinct from old.reviewed_at
    or new.dedicated_account_verified is distinct from old.dedicated_account_verified
    or new.account_verified_by        is distinct from old.account_verified_by
    or new.account_verified_at        is distinct from old.account_verified_at
  ) then
    raise exception 'Sólo un moderador puede cambiar el estado o la verificación de una campaña';
  end if;

  return new;
end $$;

drop trigger if exists trg_campaigns_guard on campaigns;
create trigger trg_campaigns_guard
  before insert or update on campaigns
  for each row execute function guard_campaign_columns();

-- ---------- Parte 2: perfiles ----------
-- El role sólo lo cambia un admin (o una operación manual en el SQL Editor).
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
