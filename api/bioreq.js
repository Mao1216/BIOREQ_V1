const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const { randomUUID, randomBytes } = require('crypto');

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

function isAllowedStatusTransition(fromStatus, toStatus) {
    if (fromStatus === toStatus) return true;
    const transitions = {
        'BORRADOR': ['EN REVISIÓN', 'CANCELADO'],
        'EN REVISIÓN': ['OBSERVADO', 'APROBACIÓN PENDIENTE – LOG', 'APROBADO', 'CANCELADO'],
        'OBSERVADO': ['EN REVISIÓN', 'CANCELADO'],
        'APROBACIÓN PENDIENTE – LOG': ['OBSERVADO', 'APROBADO', 'CANCELADO'],
        'APROBADO': [],
        'CANCELADO': []
    };
    return transitions[fromStatus]?.includes(toStatus) || false;
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

function mapSupplierRegistration(row) {
    return {
        id: row.id,
        requestId: row.request_id,
        productCode: row.product_code,
        supplierName: row.supplier_name,
        manufacturer: row.manufacturer,
        origin: row.origin,
        moqs: row.moqs || [],
        currency: row.currency,
        deliveryTime: row.delivery_time,
        purchaseOrderType: row.purchase_order_type,
        paymentTerms: row.payment_terms,
        invoiceType: row.invoice_type,
        incoterm: row.incoterm,
        workingStandard: row.working_standard,
        wsCost: row.ws_cost,
        observations: row.observations,
        documentation: row.documentation || [],
        status: row.status || 'BORRADOR',
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapSupplierSearch(row) {
    return {
        requestId: row.request_id,
        status: row.status || 'ABIERTO',
        openedAt: row.opened_at,
        sentToDfAt: row.sent_to_df_at,
        closedAt: row.closed_at,
        reopenedAt: row.reopened_at,
        updatedAt: row.updated_at
    };
}

async function sendNotificationEmail(to, subject, text) {
    // El envío real se activa al registrar RESEND_API_KEY y EMAIL_FROM en Vercel.
    // Mientras tanto la notificación se conserva en Supabase como trazabilidad.
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return false;
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text })
    });
    if (!response.ok) throw new Error('No se pudo enviar el correo de notificación.');
    return true;
}

async function addHistory(entry) {
    await supabase('bioreq_history', {
        method: 'POST',
        prefer: 'return=minimal',
        body: JSON.stringify(entry)
    });
}

async function getSession(req) {
    const token = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('bioreq_session='))?.slice('bioreq_session='.length);
    if (!token) return null;
    const sessions = await supabase(`bioreq_web_sessions?token=eq.${encodeURIComponent(token)}&select=profile_id,expires_at,active_role`);
    const session = sessions[0];
    if (!session || new Date(session.expires_at) <= new Date()) return null;
    const profiles = await supabase(`bioreq_user_profiles?id=eq.${encodeURIComponent(session.profile_id)}&is_active=eq.true&select=id,email,role,full_name`);
    const profile = profiles[0];
    const roles = { ANDF: 'ANDF_ADF', SGID: 'SGID_CDF', LOG: 'LOG', SUPER_ADMIN: 'SUPER_ADMIN' };
    const selectableRoles = ['ANDF_ADF', 'SGID_CDF', 'LOG'];
    const activeRole = profile?.role === 'SUPER_ADMIN' && selectableRoles.includes(session.active_role) ? session.active_role : null;
    return profile ? { id: profile.id, username: profile.email, role: activeRole || roles[profile.role] || profile.role, name: profile.full_name, isSig: profile.role === 'SUPER_ADMIN' } : null;
}

module.exports = async (req, res) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(503).json({ error: 'Supabase no está configurado en Vercel.' });
    }

    try {
        const currentUser = await getSession(req);
        if (!currentUser) return res.status(401).json({ error: 'Sesión no válida o vencida.' });

        if (req.method === 'GET') {
            if (req.query.catalog === '1') {
                const catalog = await supabase('bioreq_catalog_items?is_active=eq.true&select=code,name,item_type,category,pharmaceutical_form,unit_of_measure&order=name.asc');
                return res.status(200).json({ items: catalog });
            }
            if (req.query.suppliers === '1') {
                const suppliers = await supabase('bioreq_suppliers?is_active=eq.true&select=code,name,category,contact_email,phone&order=name.asc');
                return res.status(200).json({ items: suppliers });
            }
            if (req.query.providerRegistrations === '1') {
                const registrations = await supabase('bioreq_supplier_registrations?select=*&order=created_at.asc');
                return res.status(200).json({ items: registrations.map(mapSupplierRegistration) });
            }
            if (req.query.supplierSearches === '1') {
                const searches = await supabase('bioreq_supplier_searches?select=*&order=opened_at.asc');
                return res.status(200).json({ items: searches.map(mapSupplierSearch) });
            }
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

        const { data, action } = req.body || {};
        if (!data) return res.status(400).json({ error: 'Solicitud incompleta.' });

        if (action === 'save_provider') {
            if (![ 'LOG', 'SUPER_ADMIN' ].includes(currentUser.role)) return res.status(403).json({ error: 'Solo Logística puede registrar proveedores.' });
            if (!data.requestId || !String(data.supplierName || '').trim()) return res.status(400).json({ error: 'La solicitud y el proveedor son obligatorios.' });
            const providerData = {
                request_id: data.requestId,
                product_code: data.productCode || null,
                supplier_name: data.supplierName.trim(),
                manufacturer: data.manufacturer || null,
                origin: data.origin || null,
                moqs: Array.isArray(data.moqs) ? data.moqs : [],
                currency: data.currency || null,
                delivery_time: data.deliveryTime || null,
                purchase_order_type: data.purchaseOrderType || null,
                payment_terms: data.paymentTerms || null,
                invoice_type: data.invoiceType || null,
                incoterm: data.incoterm || null,
                working_standard: data.workingStandard || null,
                ws_cost: data.wsCost || null,
                observations: data.observations || null,
                documentation: Array.isArray(data.documentation) ? data.documentation : [],
                status: data.status || 'BORRADOR',
                updated_at: new Date().toISOString()
            };
            let saved;
            if (data.id) {
                const rows = await supabase(`bioreq_supplier_registrations?id=eq.${encodeURIComponent(data.id)}`, {
                    method: 'PATCH', prefer: 'return=representation', body: JSON.stringify(providerData)
                });
                saved = rows[0];
            } else {
                const rows = await supabase('bioreq_supplier_registrations', {
                    method: 'POST', prefer: 'return=representation', body: JSON.stringify({ ...providerData, created_by: currentUser.id })
                });
                saved = rows[0];
            }
            return res.status(200).json({ provider: mapSupplierRegistration(saved) });
        }

        if (action === 'update_provider_status') {
            const rows = await supabase(`bioreq_supplier_registrations?id=eq.${encodeURIComponent(data.providerId)}&select=*`);
            const provider = rows[0];
            if (!provider) return res.status(404).json({ error: 'Proveedor no encontrado.' });
            const oldStatus = provider.status || 'BORRADOR';
            const transitions = {
                BORRADOR: ['EN EVALUACIÓN DF'],
                'EN EVALUACIÓN DF': ['OBSERVADO', 'RECHAZADO', 'EN REVISIÓN'],
                OBSERVADO: ['EN EVALUACIÓN DF'],
                RECHAZADO: [],
                'EN REVISIÓN': []
            };
            if (!transitions[oldStatus]?.includes(data.status)) return res.status(409).json({ error: `No se puede cambiar el estado de ${oldStatus} a ${data.status}.` });
            const requiresLog = ['BORRADOR', 'OBSERVADO'].includes(oldStatus);
            if (requiresLog && !['LOG', 'SUPER_ADMIN'].includes(currentUser.role)) return res.status(403).json({ error: 'Esta acción corresponde a Logística.' });
            if (!requiresLog && !['ANDF_ADF', 'SUPER_ADMIN'].includes(currentUser.role)) return res.status(403).json({ error: 'Esta acción corresponde a Desarrollo Farmacéutico.' });
            const savedRows = await supabase(`bioreq_supplier_registrations?id=eq.${encodeURIComponent(data.providerId)}`, {
                method: 'PATCH', prefer: 'return=representation', body: JSON.stringify({ status: data.status, updated_at: new Date().toISOString() })
            });
            await supabase('bioreq_supplier_history', {
                method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ supplier_registration_id: provider.id, old_status: oldStatus, new_status: data.status, action: data.action || 'actualizar_estado', user_id: currentUser.id, user_role: currentUser.role, user_name: currentUser.name, comment: data.comment || null })
            });
            return res.status(200).json({ provider: mapSupplierRegistration(savedRows[0]) });
        }

        if (action === 'update_supplier_search') {
            if (!data.requestId || !data.operation) return res.status(400).json({ error: 'La búsqueda y la operación son obligatorias.' });
            const requestRows = await supabase(`bioreq_requests?id=eq.${encodeURIComponent(data.requestId)}&select=id,req_number,requester_id,request_data`);
            const request = requestRows[0];
            if (!request) return res.status(404).json({ error: 'Requerimiento no encontrado.' });
            const searchRows = await supabase(`bioreq_supplier_searches?request_id=eq.${encodeURIComponent(data.requestId)}&select=*`);
            const existing = searchRows[0] || null;
            const oldStatus = existing?.status || 'ABIERTO';
            const now = new Date().toISOString();

            if (data.operation === 'send_to_df') {
                if (!['LOG', 'SUPER_ADMIN'].includes(currentUser.role)) return res.status(403).json({ error: 'Solo Logística puede enviar proveedores a Desarrollo Farmacéutico.' });
                if (oldStatus === 'CERRADO') return res.status(409).json({ error: 'La búsqueda está cerrada. Reábrela antes de enviar proveedores.' });
                const rows = await supabase('bioreq_supplier_searches', {
                    method: 'POST', prefer: 'resolution=merge-duplicates,return=representation',
                    body: JSON.stringify({ request_id: request.id, status: oldStatus, opened_at: existing?.opened_at || now, sent_to_df_at: now, closed_at: null, reopened_at: existing?.reopened_at || null, updated_at: now })
                });
                return res.status(200).json({ search: mapSupplierSearch(rows[0]) });
            }

            if (data.operation === 'close') {
                if (!['LOG', 'SUPER_ADMIN'].includes(currentUser.role)) return res.status(403).json({ error: 'Solo Logística puede cerrar la búsqueda de proveedores.' });
                if (!existing?.sent_to_df_at) return res.status(409).json({ error: 'Primero debes enviar los proveedores a revisión de Desarrollo Farmacéutico.' });
                if (oldStatus === 'CERRADO') return res.status(409).json({ error: 'La búsqueda ya se encuentra cerrada.' });
                const rows = await supabase(`bioreq_supplier_searches?request_id=eq.${encodeURIComponent(request.id)}`, {
                    method: 'PATCH', prefer: 'return=representation', body: JSON.stringify({ status: 'CERRADO', closed_at: now, updated_at: now })
                });
                return res.status(200).json({ search: mapSupplierSearch(rows[0]) });
            }

            if (data.operation === 'reopen') {
                const isLogistics = ['LOG', 'SUPER_ADMIN'].includes(currentUser.role);
                const isRequester = currentUser.role === 'ANDF_ADF' && (request.requester_id === currentUser.id || currentUser.isSig);
                if (!isLogistics && !isRequester) return res.status(403).json({ error: 'Solo Logística o el solicitante de Desarrollo Farmacéutico pueden reabrir esta búsqueda.' });
                if (!existing || oldStatus !== 'CERRADO') return res.status(409).json({ error: 'Solo es posible reabrir una búsqueda cerrada.' });
                const rows = await supabase(`bioreq_supplier_searches?request_id=eq.${encodeURIComponent(request.id)}`, {
                    method: 'PATCH', prefer: 'return=representation', body: JSON.stringify({ status: 'REABIERTO', reopened_at: now, closed_at: null, updated_at: now })
                });
                if (isRequester && !isLogistics) {
                    const logisticsProfiles = await supabase('bioreq_user_profiles?role=eq.LOG&is_active=eq.true&select=id,email');
                    const product = request.request_data?.productName || 'el requerimiento';
                    await Promise.all(logisticsProfiles.map(async profile => {
                        const message = `Desarrollo Farmacéutico reabrió la búsqueda de proveedores para ${request.req_number} (${product}).`;
                        const emailSent = await sendNotificationEmail(profile.email, `BIOREQ: búsqueda reabierta para ${request.req_number}`, message);
                        await supabase('bioreq_notifications', { method: 'POST', prefer: 'return=minimal', body: JSON.stringify({ request_id: request.id, recipient_id: profile.id, recipient_email: profile.email, message, status: emailSent ? 'ENVIADO' : 'PENDIENTE_CONFIGURACION', created_by: currentUser.id }) });
                    }));
                }
                return res.status(200).json({ search: mapSupplierSearch(rows[0]) });
            }

            return res.status(400).json({ error: 'Operación de búsqueda no reconocida.' });
        }

        if (action === 'notify_requester') {
            if (![ 'LOG', 'SUPER_ADMIN' ].includes(currentUser.role)) return res.status(403).json({ error: 'Solo Logística puede notificar al solicitante.' });
            const requests = await supabase(`bioreq_requests?id=eq.${encodeURIComponent(data.requestId)}&select=id,req_number,requester_id,request_data`);
            const request = requests[0];
            if (!request) return res.status(404).json({ error: 'Requerimiento no encontrado.' });
            const profiles = await supabase(`bioreq_user_profiles?id=eq.${encodeURIComponent(request.requester_id)}&select=email,full_name`);
            const recipient = profiles[0];
            if (!recipient?.email) return res.status(404).json({ error: 'No se encontró el correo del solicitante.' });
            const product = request.request_data?.productName || 'tu requerimiento';
            const message = `Logística ya registró proveedores para ${request.req_number} (${product}). Ingresa a BIOREQ para revisarlos.`;
            const emailSent = await sendNotificationEmail(recipient.email, `BIOREQ: proveedores encontrados para ${request.req_number}`, message);
            const rows = await supabase('bioreq_notifications', {
                method: 'POST', prefer: 'return=representation',
                body: JSON.stringify({ request_id: request.id, recipient_id: request.requester_id, recipient_email: recipient.email, message, status: emailSent ? 'ENVIADO' : 'PENDIENTE_CONFIGURACION', created_by: currentUser.id })
            });
            return res.status(200).json({ notification: rows[0], emailSent });
        }
        const { _comment, ...persistedData } = data;

        const now = new Date().toISOString();
        let request;
        let oldStatus = null;

        if (data.id) {
            const rows = await supabase(`bioreq_requests?id=eq.${encodeURIComponent(data.id)}&select=*`);
            if (!rows.length) return res.status(404).json({ error: 'Requerimiento no encontrado.' });
            const previous = rows[0];
            oldStatus = previous.status;
            if (!isAllowedStatusTransition(oldStatus, data.status)) {
                return res.status(409).json({ error: `No se puede cambiar el estado de ${oldStatus} a ${data.status}.` });
            }
            let requestCode = previous.req_number;
            const prefix = prefixForStatus(data.status);
            if (prefix && !requestCode.startsWith(`${prefix}-`)) {
                const code = await supabase('rpc/next_bioreq_code', { method: 'POST', body: JSON.stringify({ p_prefix: prefix }) });
                requestCode = code;
            }
            const requestData = { ...persistedData, reqNumber: requestCode, updatedAt: now };
            delete requestData.id;
            const updated = await supabase(`bioreq_requests?id=eq.${encodeURIComponent(data.id)}`, {
                method: 'PATCH', prefer: 'return=representation',
                body: JSON.stringify({ req_number: requestCode, status: data.status, request_data: requestData, updated_at: now })
            });
            request = mapRequest(updated[0]);
        } else {
            const prefix = prefixForStatus(data.status) || 'TEM';
            const code = await supabase('rpc/next_bioreq_code', { method: 'POST', body: JSON.stringify({ p_prefix: prefix }) });
            const id = `req_${randomUUID()}`;
            const requestData = { ...persistedData, reqNumber: code, date: now, createdAt: now, updatedAt: now };
            const created = await supabase('bioreq_requests', {
                method: 'POST', prefer: 'return=representation',
                body: JSON.stringify({ id, req_number: code, status: data.status, requester_id: currentUser.id, request_data: requestData })
            });
            request = mapRequest(created[0]);
        }

        if (!data.id || oldStatus !== request.status) {
            const historyBase = {
                request_id: request.id,
                user_id: currentUser.id,
                user_role: currentUser.role,
                user_name: currentUser.name,
                request_code: request.reqNumber
            };
            // Si se envía una solicitud nueva sin pasar por borrador, conservamos los dos hitos.
            if (!data.id && action === 'enviar_revision') {
                await addHistory({
                    ...historyBase,
                    old_status: null,
                    new_status: 'BORRADOR',
                    action: 'crear',
                    comment: 'Creación del requerimiento'
                });
                await addHistory({
                    ...historyBase,
                    old_status: 'BORRADOR',
                    new_status: request.status,
                    action: 'enviar_revision',
                    comment: data._comment || 'Enviado a revisión'
                });
            } else {
                await addHistory({
                    ...historyBase,
                    old_status: oldStatus,
                    new_status: request.status,
                    action: data.id ? (action || 'guardar') : 'crear',
                    comment: data._comment || (data.id ? '' : 'Solicitud creada')
                });
            }
        }

        return res.status(200).json({ request });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message || 'No se pudo procesar la solicitud.' });
    }
};
