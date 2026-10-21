-- 014 · El organizador puede reenviar a revisión una campaña rechazada
-- Con la pantalla de editar campaña, un organizador corrige lo que el
-- moderador le marcó y la vuelve a enviar. El trigger de la 012/013 no le
-- dejaba cambiar el status en ningún caso; esto habilita SOLO la transición
-- borrador/rechazada -> en_revision. Aprobar, rechazar, pausar, etc. siguen
-- siendo sólo de moderadores. El motivo de rechazo anterior se conserva para
-- que el moderador vea qué se había pedido corregir. Idempotente.

-- ---------- Reemplazo de guard_campaign_columns (resto de reglas igual a 013) ----------
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

  -- Única transición de estado que puede hacer el organizador: reenviar a
  -- revisión una campaña en borrador o rechazada (después de corregirla).
  if (new.status is distinct from old.status
      and not (old.status in ('borrador', 'rechazada') and new.status = 'en_revision'))
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
-- El trigger trg_campaigns_guard (012) ya apunta a esta función.
