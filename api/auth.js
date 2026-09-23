const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const APP_URL = process.env.APP_URL;
const SELECTABLE_SIG_ROLES = ['ANDF_ADF', 'SGID_CDF', 'LOG'];

function cookie(req, name) {
    return (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || null;
}

function setCookie(res, name, value, maxAge = 0) {
    const valueToSet = `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge ? `; Max-Age=${maxAge}` : '; Max-Age=0'}`;
    const current = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [...(current ? (Array.isArray(current) ? current : [current]) : []), valueToSet]);
}

function headers() {
    return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
}

async function rest(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `Supabase error ${response.status}`);
    return text ? JSON.parse(text) : null;
}

function redirect(res, target) {
    res.writeHead(302, { Location: target });
    res.end();
}

function applicationUrl(req) {
    return APP_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

module.exports = async (req, res) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(503).json({ error: 'Supabase no está configurado.' });
    const action = req.query.action;

    try {
        if (action === 'microsoft') {
            const verifier = crypto.randomBytes(48).toString('base64url');
            const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
            const callback = `${applicationUrl(req)}/api/auth?action=callback`;
            setCookie(res, 'bioreq_oauth_verifier', verifier, 600);
            return redirect(res, `${SUPABASE_URL}/auth/v1/authorize?provider=azure&scopes=email&redirect_to=${encodeURIComponent(callback)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`);
        }

        if (action === 'callback') {
            const verifier = cookie(req, 'bioreq_oauth_verifier');
            if (!req.query.code || !verifier) return redirect(res, `${applicationUrl(req)}/?auth_error=login_failed`);
            const tokenResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
                method: 'POST', headers: headers(), body: JSON.stringify({ auth_code: req.query.code, code_verifier: verifier })
            });
            const tokenBody = await tokenResponse.text();
            if (!tokenResponse.ok) throw new Error(tokenBody || 'No se pudo validar Microsoft.');
            const tokens = JSON.parse(tokenBody);
            const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tokens.access_token}` } });
            const microsoftUser = await userResponse.json();
            if (!userResponse.ok || !microsoftUser.email) throw new Error('No se pudo identificar el correo de Microsoft.');

            const profiles = await rest(`bioreq_user_profiles?email=eq.${encodeURIComponent(microsoftUser.email.toLowerCase())}&is_active=eq.true&select=*`);
            const profile = profiles[0];
            if (!profile) return redirect(res, `${applicationUrl(req)}/?auth_error=not_authorized`);
            if (profile.auth_user_id && profile.auth_user_id !== microsoftUser.id) return redirect(res, `${applicationUrl(req)}/?auth_error=identity_mismatch`);
            if (!profile.auth_user_id) await rest(`bioreq_user_profiles?id=eq.${profile.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ auth_user_id: microsoftUser.id, updated_at: new Date().toISOString() }) });

            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            await rest('bioreq_web_sessions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ token: sessionToken, profile_id: profile.id, expires_at: expiresAt }) });
            setCookie(res, 'bioreq_session', sessionToken, 30 * 24 * 60 * 60);
            setCookie(res, 'bioreq_oauth_verifier', 'deleted');
            return redirect(res, applicationUrl(req));
        }

        if (action === 'logout' && req.method === 'POST') {
            const token = cookie(req, 'bioreq_session');
            if (token) await rest(`bioreq_web_sessions?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
            setCookie(res, 'bioreq_session', 'deleted');
            return res.status(204).end();
        }

        if (action === 'session') {
            const token = cookie(req, 'bioreq_session');
            if (!token) return res.status(401).json({ error: 'Sin sesión.' });
            const sessions = await rest(`bioreq_web_sessions?token=eq.${encodeURIComponent(token)}&select=profile_id,expires_at,active_role`);
            const session = sessions[0];
            if (!session || new Date(session.expires_at) <= new Date()) return res.status(401).json({ error: 'Sesión vencida.' });
            const profiles = await rest(`bioreq_user_profiles?id=eq.${encodeURIComponent(session.profile_id)}&is_active=eq.true&select=id,email,full_name,role`);
            const profile = profiles[0];
            if (!profile) return res.status(401).json({ error: 'Perfil no autorizado.' });
            const roles = { ANDF: 'ANDF_ADF', SGID: 'SGID_CDF', LOG: 'LOG', SUPER_ADMIN: 'SUPER_ADMIN' };
            const isSig = profile.role === 'SUPER_ADMIN';
            const activeRole = isSig && SELECTABLE_SIG_ROLES.includes(session.active_role) ? session.active_role : null;
            return res.status(200).json({ user: { id: profile.id, email: profile.email, name: profile.full_name, role: activeRole || roles[profile.role] || profile.role, isSig, activeRole } });
        }

        if (action === 'select-role' && req.method === 'POST') {
            const token = cookie(req, 'bioreq_session');
            const selectedRole = req.body?.role;
            if (!token || !SELECTABLE_SIG_ROLES.includes(selectedRole)) return res.status(400).json({ error: 'Perfil no válido.' });
            const sessions = await rest(`bioreq_web_sessions?token=eq.${encodeURIComponent(token)}&select=profile_id,expires_at`);
            const session = sessions[0];
            if (!session || new Date(session.expires_at) <= new Date()) return res.status(401).json({ error: 'Sesión vencida.' });
            const profiles = await rest(`bioreq_user_profiles?id=eq.${encodeURIComponent(session.profile_id)}&is_active=eq.true&select=id,email,full_name,role`);
            const profile = profiles[0];
            if (!profile || profile.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Solo SIG puede seleccionar un perfil.' });
            await rest(`bioreq_web_sessions?token=eq.${encodeURIComponent(token)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active_role: selectedRole }) });
            return res.status(200).json({ user: { id: profile.id, email: profile.email, name: profile.full_name, role: selectedRole, isSig: true, activeRole: selectedRole } });
        }

        return res.status(404).json({ error: 'Acción no encontrada.' });
    } catch (error) {
        console.error(error);
        return redirect(res, `${applicationUrl(req)}/?auth_error=login_failed`);
    }
};
