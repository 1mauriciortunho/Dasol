-- 013 · Re-revisión por cambios críticos y autoría verificada
-- Cierra dos riesgos que quedaron después de la 012:
--   1) Un organizador podía cambiar el QR, la cuenta o la meta de una campaña
--      ya aprobada sin que nadie lo revise (desvío de aportes).
--   2) Avisos de pago, denuncias y mensajes de apoyo se podían crear a nombre
--      de otro usuario, y el organizador podía editar el monto o el
--      comprobante de un aviso ajeno.
-- Desde el SQL Editor (auth.uid() nulo) no se restringe nada. Idempotente.

-- ---------- Parte 1: campañas — cambios críticos vuelven a revisión ----------
-- Reemplaza la función de la 012 conservando sus reglas y agrega:
--   · Si un no-moderador cambia un campo crítico (a dónde va la plata o
--     cuánto se pide) de una campaña aprobada/completada, la campaña vuelve
--     a 'en_revision' (se oculta del público) hasta que un moderador la apruebe.
--   · Si cambia la cuenta (QR, banco, titular, cuenta exclusiva) en cualquier
--     estado, pierde el badge de cuenta verificada.
--   · Título, historia, portada, contacto y fecha límite se editan libremente.
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
-- El trigger trg_campaigns_guard (012) ya apunta a esta función: no hace
-- falta recrearlo.

-- ---------- Parte 2: autoría — se crea sólo a nombre propio ----------
-- El anonimato público lo da is_anonymous (mensajes) o sender_name (avisos);
-- el autor real siempre queda registrado para moderación.
drop policy if exists "avisos_crear" on payment_notifications;
create policy "avisos_crear" on payment_notifications
  for insert with check (sender_id = auth.uid());

drop policy if exists "reportes_crear" on reports;
create policy "reportes_crear" on reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists "mensajes_crear" on support_messages;
create policy "mensajes_crear" on support_messages
  for insert with check (author_id = auth.uid());

-- ---------- Parte 3: avisos de pago — revisar sólo cambia el estado ----------
-- Nadie (ni organizador ni moderador) edita desde la API lo que declaró el
-- donante. Al cambiar el status, la revisión se firma con el usuario actual.
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
