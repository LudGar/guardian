// Deploy: supabase functions deploy save-guardian --no-verify-jwt
// (or turn OFF "Verify JWT with legacy secret" for this function in the dashboard — publishable keys aren't JWTs)
// Secrets: supabase secrets set BUNGIE_API_KEY=... SITE_ORIGIN=https://ludgar.github.io
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUNGIE_API_KEY = Deno.env.get('BUNGIE_API_KEY')!;
const ORIGIN = Deno.env.get('SITE_ORIGIN') ?? 'https://ludgar.github.io';
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-bungie-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = req.headers.get('x-bungie-token');
    const { membershipId, data } = await req.json();
    if (!token || !/^[0-9]{10,20}$/.test(String(membershipId)) || typeof data !== 'object' || !data) return reply({ error: 'bad request' }, 400);
    if (JSON.stringify(data).length > 30000) return reply({ error: 'too large' }, 413);

    // Verify the Bungie token belongs to this Guardian.
    const r = await fetch('https://www.bungie.net/Platform/User/GetMembershipsForCurrentUser/', {
      headers: { 'X-API-Key': BUNGIE_API_KEY, Authorization: 'Bearer ' + token, Origin: ORIGIN },
    });
    const j = await r.json();
    const ids: string[] = (j?.Response?.destinyMemberships ?? []).map((m: { membershipId: string }) => String(m.membershipId));
    if (!ids.includes(String(membershipId))) return reply({ error: 'forbidden' }, 403);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await sb.from('guardian_edits').upsert({ membership_id: String(membershipId), data, updated_at: new Date().toISOString() });
    if (error) throw error;
    return reply({ ok: true });
  } catch (e) {
    return reply({ error: String(e) }, 500);
  }
});
