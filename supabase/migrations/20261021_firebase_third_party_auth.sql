-- ============================================================================
-- Firebase Authentication como proveedor externo (third-party auth) de Supabase.
--
-- La integración en sí se registró por Management API (no es SQL):
--   POST /v1/projects/azwuzsukvqjogcfqljhg/config/auth/third-party-auth
--   { "oidc_issuer_url": "https://securetoken.google.com/oloos-bd" }
-- Con eso Supabase acepta los ID tokens de Firebase del proyecto oloos-bd y
-- auth.jwt() / auth.jwt()->>'sub' (= UID de Firebase) quedan disponibles en RLS.
--
-- Rol de Postgres: PostgREST hace `SET ROLE <claim role del token>`. Las cuentas de
-- Firebase llevan:
--   - role = "authenticated"  (lo asignamos a las que no tenían claim), o
--   - role = "operativo"      (174 cuentas: claim histórico puesto por la app móvil).
-- Para NO tocar el claim que usa la app móvil, se crea el rol `operativo` que hereda
-- todo de `authenticated`: las políticas `to authenticated` le aplican igual.
-- Idempotente.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'operativo') then
    create role operativo nologin inherit;
  end if;
end
$$;

grant authenticated to operativo;
grant operativo to authenticator;

-- Diagnóstico: quién es el usuario de la petición (sin datos sensibles).
create or replace function public.auth_whoami()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'db_role',    current_user,
    'sub',        auth.jwt() ->> 'sub',
    'email',      auth.jwt() ->> 'email',
    'claim_role', auth.jwt() ->> 'role',
    'issuer',     auth.jwt() ->> 'iss'
  );
$$;

revoke all on function public.auth_whoami() from public;
grant execute on function public.auth_whoami() to anon, authenticated, operativo;
