const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(prefer = '') {
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {})
    };
}

async function supabase(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: { ...headers(options.prefer), ...(options.headers || {}) }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `Supabase error ${response.status}`);
    return text ? JSON.parse(text) : null;
}

function prefixForStatus(status) {
    if (status === 'BORRADOR') return 'TEM';
    if (status === 'EN REVISIÓN') return 'SOL';
    if (status === 'APROBADO') return 'REQ';
    return null;
}

function mapRequest(row) {
    return {
        ...row.request_data,
        id: row.id,
        reqNumber: row.req_number,
        status: row.status,
        requesterId: row.requester_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapHistory(row) {
    return {
        id: row.id,
        requestId: row.request_id,
        oldStatus: row.old_status,
        newStatus: row.new_status,
        action: row.action,
        userId: row.user_id,
        userRole: row.user_role,
        userName: row.user_name,
        comment: row.comment,
        requestCode: row.request_code,
        timestamp: row.created_at
    };
}

async function addHistory(entry) {
    await supabase('bioreq_history', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify(entry)
    });
}

module.exports = async (req, res) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(503).json({ error: 'Supabase no está configurado en Vercel.' });
    }

    try {
        if (req.method === 'GET') {
            if (req.query.preview) {
                const prefix = req.query.preview;
                const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: '2-digit', month: '2-digit' }).formatToParts(new Date());
                const period = `${parts.find(part => part.type === 'year').value}${parts.find(part => part.type === 'month').value}`;
                const counters = await supabase(`bioreq_counters?prefix=eq.${prefix}&period=eq.${period}&select=last_value`);
                const next = (counters[0]?.last_value || 0) + 1;
                return res.status(200).json({ code: `${prefix}-${period}${String(next).padStart(2, '0')}` });
            }
            const [requests, history] = await Promise.all([
                supabase('bioreq_requests?select=*&order=created_at.asc'),
                supabase('bioreq_history?select=*&order=created_at.asc')
            ]);
            return res.status(200).json({ requests: requests.map(mapRequest), history: history.map(mapHistory) });
        }

        if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

        const { data, action, user } = req.body || {};
        if (!data || !user) return res.status(400).json({ error: 'Solicitud incompleta.' });

        const now = new Date().toISOString();
        let request;
        let oldStatus = null;

        if (data.id) {
            const rows = await supabase(`bioreq_requests?id=eq.${encodeURIComponent(data.id)}&select=*`);
            if (!rows.length) return res.status(404).json({ error: 'Requerimiento no encontrado.' });
            const previous = rows[0];
            oldStatus = previous.status;
            let requestCode = previous.req_number;
            const prefix = prefixForStatus(data.status);
            if (prefix && !requestCode.startsWith(`${prefix}-`)) {
                const code = await supabase('rpc/next_bioreq_code', { method: 'POST', body: JSON.stringify({ p_prefix: prefix }) });
                requestCode = code;
            }
            const requestData = { ...data, reqNumber: requestCode, updatedAt: now };
            delete requestData.id;
            const updated = await supabase(`bioreq_requests?id=eq.${encodeURIComponent(data.id)}`, {
                method: 'PATCH', prefer: 'return=representation',
                body: JSON.stringify({ req_number: requestCode, status: data.status, request_data: requestData, updated_at: now })
            });
            request = mapRequest(updated[0]);
        } else {
            const prefix = prefixForStatus(data.status) || 'TEM';
            const code = await supabase('rpc/next_bioreq_code', { method: 'POST', body: JSON.stringify({ p_prefix: prefix }) });
            const id = `req_${crypto.randomUUID()}`;
            const requestData = { ...data, reqNumber: code, date: now, createdAt: now, updatedAt: now };
            const created = await supabase('bioreq_requests', {
                method: 'POST', prefer: 'return=representation',
                body: JSON.stringify({ id, req_number: code, status: data.status, requester_id: user.id, request_data: requestData })
            });
            request = mapRequest(created[0]);
        }

        if (!data.id || oldStatus !== request.status) {
            await addHistory({
                request_id: request.id,
                old_status: oldStatus,
                new_status: request.status,
                action: action || (data.id ? 'guardar' : 'crear'),
                user_id: user.id,
                user_role: user.role,
                user_name: user.name,
                comment: data._comment || (data.id ? '' : 'Solicitud creada'),
                request_code: request.reqNumber
            });
        }

        return res.status(200).json({ request });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message || 'No se pudo procesar la solicitud.' });
    }
};
