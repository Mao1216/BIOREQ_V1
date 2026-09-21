// --- 2. UTILITY FUNCTIONS ---
let draftCodePreview = 'TEM-Generando...';

async function loadDatabase() {
    const response = await fetch('/api/bioreq', {
        headers: { 'x-bioreq-session': currentSessionToken || '' }
    });
    if (!response.ok) throw new Error('No se pudo cargar la información de Supabase.');
    const data = await response.json();
    db.requests = data.requests;
    db.history = data.history;
}

async function loadDraftCodePreview() {
    try {
        const response = await fetch('/api/bioreq?preview=TEM', {
            headers: { 'x-bioreq-session': currentSessionToken || '' }
        });
        const data = await response.json();
        draftCodePreview = data.code || draftCodePreview;
        if (currentView === 'form' && !viewContextId) renderApp();
    } catch (error) {
        console.warn('No se pudo preparar el código de borrador.', error);
    }
}

function getNextRequestCode() { return draftCodePreview; }

function getCurrentDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} – ${hours}:${minutes}`;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const colors = {
        success: 'bg-green-100 border-green-500 text-green-700',
        error: 'bg-red-100 border-red-500 text-red-700',
        warning: 'bg-yellow-100 border-yellow-500 text-yellow-700',
        info: 'bg-blue-100 border-blue-500 text-blue-700'
    };

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.className = `toast-enter flex items-center p-4 mb-2 border-l-4 rounded shadow-md ${colors[type]}`;
    toast.innerHTML = `
        <i class="fas ${icons[type]} mr-3 text-lg"></i>
        <p class="font-medium text-sm">${message}</p>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.replace('toast-enter', 'toast-leave');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function getStatusBadge(status) {
    const config = {
        [STATUS.BORRADOR]: 'bg-gray-100 text-gray-700 ring-gray-500/10',
        [STATUS.EN_REVISION]: 'bg-blue-50 text-blue-700 ring-blue-700/10',
        [STATUS.OBSERVADO]: 'bg-red-50 text-red-700 ring-red-600/10',
        [STATUS.APROBACION_PENDIENTE_LOG]: 'bg-purple-50 text-purple-700 ring-purple-700/10',
        [STATUS.APROBADO]: 'bg-green-50 text-green-700 ring-green-600/20',
        [STATUS.CANCELADO]: 'bg-gray-800 text-white ring-gray-900/10'
    };
    const classes = config[status] || 'bg-gray-100 text-gray-700';
    return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${classes}">${status}</span>`;
}

function getPriorityBadge(priorityId) {
    if(!priorityId) return '-';
    const p = LISTS.priorities.find(x => x.id === priorityId);
    return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${p.color}" title="${p.desc}">Prioridad ${p.label}</span>`;
}

// --- 3. DATABASE OPERATIONS ---
async function saveRequest(data, action) {
    const response = await fetch('/api/bioreq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bioreq-session': currentSessionToken || '' },
        body: JSON.stringify({ data, action, user: currentUser })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo guardar el requerimiento.');
    await loadDatabase();
    return result.request;
}

function getRequestsByRole() {
    if (!currentUser) return [];
    if (currentUser.role === ROLES.ANDF_ADF) {
        return db.requests.filter(r => r.requesterId === currentUser.id);
    } else if (currentUser.role === ROLES.SGID_CDF) {
        return db.requests.filter(r => r.status !== STATUS.BORRADOR);
    } else if (currentUser.role === ROLES.LOG) {
        return db.requests.filter(r => 
            r.status === STATUS.APROBACION_PENDIENTE_LOG || 
            r.status === STATUS.APROBADO ||
            (r.status === STATUS.OBSERVADO && hasLogInteraction(r.id)) ||
            (r.status === STATUS.CANCELADO && hasLogInteraction(r.id))
        );
    }
    return [];
}

function hasLogInteraction(reqId) {
    return db.history.some(h => h.requestId === reqId && h.userRole === ROLES.LOG);
}

// --- 4. UI COMPONENTS & MODALS ---
function openModal(title, content, onConfirm, confirmText = 'Confirmar', isDanger = false) {
    const container = document.getElementById('modal-container');
    const contentDiv = document.getElementById('modal-content');
    const btnClass = isDanger ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-primary hover:bg-primaryHover focus:ring-primary';

    contentDiv.innerHTML = `
        <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">${title}</h3>
        <div class="mt-2 mb-6">${content}</div>
        <div class="flex justify-end gap-3">
            <button id="modal-cancel" class="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button id="modal-confirm" class="px-4 py-2 ${btnClass} text-white rounded-md text-sm font-medium">${confirmText}</button>
        </div>
    `;
    container.classList.remove('hidden');
    document.getElementById('modal-cancel').onclick = () => container.classList.add('hidden');
    document.getElementById('modal-confirm').onclick = () => { onConfirm(); container.classList.add('hidden'); };
}

function closeAllModals() {
    document.getElementById('modal-container').classList.add('hidden');
}

// --- 5. ROUTING & RENDERING LOGIC ---
function navigateTo(view, id = null) {
    currentView = view;
    viewContextId = id;
    if (view !== 'detail') detailTab = 'detail';
    renderApp();
    if (view === 'form' && !id) loadDraftCodePreview();
}

function setDetailTab(tab) {
    detailTab = tab;
    renderApp();
}

function renderApp() {
    const app = document.getElementById('app');
    if (!currentUser) {
        app.innerHTML = renderLoginView();
        return;
    }

    let layoutHTML = `
        <div class="w-64 bg-sidebar text-white flex flex-col transition-all duration-300 flex-shrink-0 hidden md:flex">
            <div class="p-6 border-b border-gray-700 flex items-center gap-3">
                <img src="assets/biomont-logo.png" alt="Biomont" class="w-10 h-8 object-contain" />
                <div><h2 class="text-sm font-bold leading-tight">BIOREQ</h2><p class="text-xs text-gray-400">Requerimientos de materiales</p></div>
            </div>
            <div class="p-4">
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Usuario Actual</div>
                <div class="flex items-center gap-2 mb-1">
                    <div class="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm"><i class="fas fa-user"></i></div>
                    <div class="overflow-hidden">
                        <p class="text-sm font-medium truncate" title="${currentUser.name}">${currentUser.name}</p>
                        <p class="text-xs text-blue-300 truncate">${currentUser.role}</p>
                    </div>
                </div>
            </div>
            <nav class="flex-1 px-4 py-4 space-y-1 overflow-y-auto">${renderSidebarMenu()}</nav>
            <div class="p-4 border-t border-gray-700">
                <button onclick="logout()" class="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-red-400 hover:text-white hover:bg-red-500 hover:bg-opacity-20 rounded-md"><i class="fas fa-sign-out-alt w-5"></i> Cerrar Sesión</button>
            </div>
        </div>
        <div class="flex-1 flex flex-col h-full overflow-hidden bg-background relative">
            <header class="md:hidden bg-white shadow-sm flex items-center justify-between p-4 z-10">
                <div class="flex items-center gap-2">
                    <img src="assets/biomont-logo.png" alt="Biomont" class="w-9 h-6 object-contain" />
                    <span class="font-semibold text-sm">BIOREQ</span>
                </div>
                <div class="flex items-center gap-3">
                     <span class="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">${currentUser.role}</span>
                     <button onclick="logout()" class="text-red-500"><i class="fas fa-sign-out-alt"></i></button>
                </div>
            </header>
            <main class="flex-1 overflow-y-auto p-4 md:p-8" id="main-content">
                ${renderCurrentView()}
            </main>
        </div>
    `;
    app.innerHTML = layoutHTML;
}

function renderSidebarMenu() {
    let menu = '';
    const isActive = (v) => currentView === v ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white';
    const baseClass = "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors w-full text-left cursor-pointer";

    menu += `<a onclick="navigateTo('dashboard')" class="${baseClass} ${isActive('dashboard')} mb-2"><i class="fas fa-chart-line w-6 text-center mr-2"></i> Dashboard</a>`;
    if (currentUser.role === ROLES.ANDF_ADF) {
        menu += `
            <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2">Acciones</div>
            <a onclick="navigateTo('form')" class="${baseClass} ${isActive('form')}"><i class="fas fa-plus-circle w-6 text-center mr-2"></i> Nuevo Requerimiento</a>
        `;
    }
    return menu;
}

function renderCurrentView() {
    switch(currentView) {
        case 'dashboard': return renderDashboard();
        case 'form': return renderForm();
        case 'detail': return renderDetail(viewContextId);
        default: return renderDashboard();
    }
}

// --- VIEWS ---
function renderLoginView() {
    return `
        <div class="min-h-screen flex items-center justify-center w-full bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div class="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border border-gray-100">
                <div class="text-center">
                    <img src="assets/biomont-logo.png" alt="Biomont" class="mx-auto h-20 w-56 object-contain" />
                    <h2 class="mt-6 text-3xl font-extrabold text-gray-900">BIOREQ</h2>
                    <p class="mt-2 text-sm text-gray-600">Gestión digital de requerimientos para desarrollo</p>
                </div>
                <form id="login-form" class="mt-8 space-y-6" onsubmit="handleLogin(event)">
                    <div class="rounded-md shadow-sm -space-y-px">
                        <div><input id="username" type="text" required class="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" placeholder="Usuario"></div>
                        <div><input id="password" type="password" required class="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" placeholder="Contraseña"></div>
                    </div>
                    <div id="login-error" class="hidden text-sm text-red-600 text-center font-medium"></div>
                    <div><button type="submit" class="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primaryHover"><i class="fas fa-sign-in-alt mr-2 mt-0.5"></i> Iniciar sesión</button></div>
                </form>
                <div class="mt-6 border-t border-gray-200 pt-4">
                    <p class="text-xs text-gray-500 mb-2 font-semibold text-center">Usuarios de prueba:</p>
                    <div class="grid grid-cols-3 gap-2 text-xs">
                        <div class="bg-gray-50 p-2 rounded text-center cursor-pointer hover:bg-gray-100 border" onclick="fillLogin('andf01')"><b>andf01</b><br>ANDF</div>
                        <div class="bg-gray-50 p-2 rounded text-center cursor-pointer hover:bg-gray-100 border" onclick="fillLogin('sgid01')"><b>sgid01</b><br>SGID</div>
                        <div class="bg-gray-50 p-2 rounded text-center cursor-pointer hover:bg-gray-100 border" onclick="fillLogin('log01')"><b>log01</b><br>LOG</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderDashboard() {
    const requests = getRequestsByRole();
    const stats = {
        total: requests.length,
        borradores: requests.filter(r => r.status === STATUS.BORRADOR).length,
        enRevision: requests.filter(r => r.status === STATUS.EN_REVISION).length,
        observados: requests.filter(r => r.status === STATUS.OBSERVADO).length,
        pendientesLog: requests.filter(r => r.status === STATUS.APROBACION_PENDIENTE_LOG).length,
        aprobados: requests.filter(r => r.status === STATUS.APROBADO).length,
    };

    let alertsHtml = '';
    if (currentUser.role === ROLES.ANDF_ADF && stats.observados > 0) {
        alertsHtml = `
            <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded shadow-sm flex">
                <i class="fas fa-exclamation-triangle text-yellow-400 mr-3"></i>
                <p class="text-sm text-yellow-700 font-medium">Tienes ${stats.observados} requerimiento(s) observado(s) pendiente(s).</p>
            </div>`;
    }

    let cardsHtml = '';
    if (currentUser.role === ROLES.ANDF_ADF) {
        cardsHtml = `
            ${renderStatCard('Total', stats.total, 'fa-list', 'bg-blue-500')}
            ${renderStatCard('Borradores', stats.borradores, 'fa-file-alt', 'bg-gray-500')}
            ${renderStatCard('En Revisión', stats.enRevision, 'fa-hourglass-half', 'bg-blue-400')}
            ${renderStatCard('Observados', stats.observados, 'fa-exclamation-circle', 'bg-red-500')}
            ${renderStatCard('Aprobados', stats.aprobados, 'fa-check-circle', 'bg-green-500')}
        `;
    } else if (currentUser.role === ROLES.SGID_CDF) {
         cardsHtml = `
            ${renderStatCard('Pendientes', stats.enRevision, 'fa-clock', 'bg-blue-500')}
            ${renderStatCard('Observadas', stats.observados, 'fa-exclamation-circle', 'bg-red-500')}
            ${renderStatCard('Aprob. (En LOG)', stats.pendientesLog, 'fa-share', 'bg-purple-500')}
            ${renderStatCard('Finalizadas', stats.aprobados, 'fa-check-double', 'bg-green-500')}
        `;
    } else if (currentUser.role === ROLES.LOG) {
         cardsHtml = `
            ${renderStatCard('Derivadas', stats.pendientesLog, 'fa-inbox', 'bg-purple-500')}
            ${renderStatCard('Aprobadas', stats.aprobados, 'fa-check-circle', 'bg-green-500')}
        `;
    }

    let tableTitle = 'Mis Requerimientos';
    let tableData = [...requests].reverse();
    if (currentUser.role === ROLES.SGID_CDF) { tableTitle = 'Bandeja - SGID/CDF'; tableData.sort((a,b) => a.status===STATUS.EN_REVISION?-1:1); }
    else if (currentUser.role === ROLES.LOG) { tableTitle = 'Solicitudes Derivadas'; tableData.sort((a,b) => a.status===STATUS.APROBACION_PENDIENTE_LOG?-1:1); }

    // Filters
    if (currentFilters.num) tableData = tableData.filter(r => r.reqNumber.toLowerCase().includes(currentFilters.num));
    if (currentFilters.prod) tableData = tableData.filter(r => (r.productName||'').toLowerCase().includes(currentFilters.prod));
    if (currentFilters.status) tableData = tableData.filter(r => r.status === currentFilters.status);
    if (currentFilters.priority) tableData = tableData.filter(r => r.priority === currentFilters.priority);
    if (currentFilters.type) tableData = tableData.filter(r => r.articleType === currentFilters.type);

    let filterHtml = '';
    if (currentUser.role === ROLES.SGID_CDF || currentUser.role === ROLES.LOG) {
        const sOpts = Object.values(STATUS).map(s => `<option value="${s}" ${currentFilters.status===s?'selected':''}>${s}</option>`).join('');
        const pOpts = LISTS.priorities.map(p => `<option value="${p.id}" ${currentFilters.priority===p.id?'selected':''}>Prioridad ${p.label}</option>`).join('');
        const tOpts = LISTS.articleTypes.map(t => `<option value="${t}" ${currentFilters.type===t?'selected':''}>${t}</option>`).join('');
        
        filterHtml = `
            <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                <h4 class="text-xs font-semibold text-gray-500 uppercase mb-3"><i class="fas fa-filter"></i> Filtros</h4>
                <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <input type="text" id="filt-num" placeholder="N° REQ..." value="${currentFilters.num}" class="border border-gray-300 rounded text-sm px-3 py-2" onchange="updateFilters()">
                    <input type="text" id="filt-prod" placeholder="Producto..." value="${currentFilters.prod}" class="border border-gray-300 rounded text-sm px-3 py-2" onchange="updateFilters()">
                    <select id="filt-status" class="border border-gray-300 rounded text-sm px-3 py-2" onchange="updateFilters()"><option value="">Todos los estados</option>${sOpts}</select>
                    <select id="filt-prio" class="border border-gray-300 rounded text-sm px-3 py-2" onchange="updateFilters()"><option value="">Todas las prioridades</option>${pOpts}</select>
                    <select id="filt-type" class="border border-gray-300 rounded text-sm px-3 py-2" onchange="updateFilters()"><option value="">Todos los tipos</option>${tOpts}</select>
                </div>
                ${Object.values(currentFilters).some(v=>v!=='') ? `<button onclick="clearFilters()" class="mt-3 text-xs text-red-600">Limpiar filtros</button>` : ''}
            </div>
        `;
    }

    return `
        <div class="max-w-7xl mx-auto">
            <div class="flex justify-between items-end mb-6">
                <div><h1 class="text-2xl font-bold">Dashboard</h1><p class="text-sm text-gray-500">Bienvenido, ${currentUser.name}</p></div>
                ${currentUser.role === ROLES.ANDF_ADF ? `<button onclick="navigateTo('form')" class="bg-primary hover:bg-primaryHover text-white px-4 py-2 rounded-md shadow text-sm font-medium"><i class="fas fa-plus"></i> Nuevo</button>` : ''}
            </div>
            ${alertsHtml}
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">${cardsHtml}</div>
            ${filterHtml}
            <div class="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                <div class="px-6 py-4 border-b border-gray-200 bg-gray-50"><h3 class="text-lg font-medium">${tableTitle}</h3></div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Solicitud / Fecha</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto / Artículo</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prioridad</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${tableData.length === 0 ? `<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500 text-sm">No hay solicitudes.</td></tr>` : 
                            tableData.map(req => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap"><div class="font-medium">${req.reqNumber}</div><div class="text-xs text-gray-500">${req.date}</div></td>
                                    <td class="px-6 py-4"><div class="text-sm font-medium truncate max-w-xs">${req.productName||'(Sin nombre)'}</div><div class="text-xs text-gray-500">${req.articleType||'-'}</div></td>
                                    <td class="px-6 py-4 whitespace-nowrap">${getPriorityBadge(req.priority)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">${getStatusBadge(req.status)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm"><button onclick="navigateTo('detail', '${req.id}')" class="text-primary hover:bg-blue-50 px-3 py-1 rounded">Revisar <i class="fas fa-chevron-right ml-1"></i></button></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderStatCard(title, value, icon, colorClass) {
    return `<div class="bg-white rounded-lg border p-4 shadow-sm flex items-center"><div class="${colorClass} p-3 rounded-full text-white mr-4 shadow-sm w-12 h-12 flex items-center justify-center"><i class="fas ${icon}"></i></div><div><p class="text-sm font-medium text-gray-500">${title}</p><p class="text-2xl font-bold text-gray-900">${value}</p></div></div>`;
}

function updateFilters() {
    currentFilters = {
        num: document.getElementById('filt-num').value.toLowerCase(),
        prod: document.getElementById('filt-prod').value.toLowerCase(),
        status: document.getElementById('filt-status').value,
        priority: document.getElementById('filt-prio').value,
        type: document.getElementById('filt-type').value
    };
    renderApp();
}

function clearFilters() {
    currentFilters = { num: '', prod: '', status: '', priority: '', type: '' };
    renderApp();
}

function renderForm() {
    if (currentUser.role !== ROLES.ANDF_ADF) return renderDashboard();
    let reqData = {}, isEdit = false;
    
    if (viewContextId) {
        const existing = db.requests.find(r => r.id === viewContextId);
        if (existing && existing.requesterId === currentUser.id && (existing.status === STATUS.BORRADOR || existing.status === STATUS.OBSERVADO)) {
            reqData = existing; isEdit = true;
        } else {
            showToast('No tienes permiso para editar esta solicitud.', 'error');
            setTimeout(() => navigateTo('dashboard'), 1500); return '';
        }
    }

    const val = (key) => reqData[key] || '';
    const isObserved = reqData.status === STATUS.OBSERVADO;

    const opts = (arr, key) => arr.map(x => typeof x === 'string' ? `<option value="${x}" ${val(key)===x?'selected':''}>${x}</option>` : `<option value="${x.id}" ${val(key)===x.id?'selected':''}>${x.label} (${x.desc})</option>`).join('');

    return `
        <div class="max-w-4xl mx-auto pb-20">
            <div class="flex items-center gap-3 mb-6"><button onclick="navigateTo('dashboard')" class="bg-white p-2 rounded-full shadow-sm border"><i class="fas fa-arrow-left"></i></button><div><h1 class="text-2xl font-bold">${isEdit ? 'Editar Requerimiento' : 'Crear Requerimiento'}</h1><p class="text-sm text-gray-500">FICHA 1 - DF</p></div></div>
            ${isObserved ? `<div class="bg-red-50 border-l-4 border-red-500 p-4 mb-6"><h3 class="font-medium text-red-800">Observada</h3><p class="italic text-sm mt-1">"${getLastObservation(reqData.id)}"</p></div>` : ''}
            <div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-5 py-4 flex items-center justify-between"><div><p class="text-xs font-semibold uppercase tracking-wide text-blue-700">Código actual</p><p class="mt-1 text-xl font-bold text-blue-900">${val('reqNumber') || getNextRequestCode()}</p></div><span class="text-xs text-blue-700">Se generará como borrador</span></div>
            
            <form id="req-form" onsubmit="handleFormSubmit(event)" class="space-y-6">
                <input type="hidden" id="req-id" value="${val('id')}">
                
                <div class="bg-white rounded-lg shadow-sm border"><div class="bg-gray-50 px-6 py-4 border-b"><h3 class="font-semibold">Descripción del Requerimiento</h3></div>
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Gestión de proveedores *</label><select id="supplierStrategy" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option><option value="PROVEEDOR_EXISTENTE" ${val('supplierStrategy')==='PROVEEDOR_EXISTENTE'?'selected':''}>Trabajar con Proveedor existente</option><option value="NUEVOS_PROVEEDORES" ${val('supplierStrategy')==='NUEVOS_PROVEEDORES'?'selected':''}>Buscar nuevos proveedores</option></select></div>
                    <div><label class="block text-sm font-medium">Cantidad de muestra *</label><input type="number" id="sampleQuantity" min="0.01" step="0.01" required value="${val('sampleQuantity')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                    <div><label class="block text-sm font-medium">Unidad de medida *</label><select id="unit" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option>${opts(LISTS.units, 'unit')}</select></div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Prioridad *</label><select id="priority" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option>${opts(LISTS.priorities, 'priority')}</select></div>
                </div></div>

                <div class="bg-white rounded-lg shadow-sm border"><div class="bg-gray-50 px-6 py-4 border-b"><h3 class="font-semibold">Información del Producto</h3></div>
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Nombre *</label><input type="text" id="productName" required value="${val('productName')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                    <div><label class="block text-sm font-medium">Categoría *</label><select id="category" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option>${opts(LISTS.categories, 'category')}</select></div>
                    <div><label class="block text-sm font-medium">Forma farmacéutica</label><select id="pharmaceuticalForm" class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option>${opts(LISTS.pharmaForms, 'pharmaceuticalForm')}</select></div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Responsable *</label><input type="text" id="responsible" required value="${val('responsible') || currentUser.name}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                </div></div>

                <div class="bg-white rounded-lg shadow-sm border"><div class="bg-gray-50 px-6 py-4 border-b"><h3 class="font-semibold">Información complementaria</h3></div>
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Tipo de artículo *</label><select id="articleType" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option>${opts(LISTS.articleTypes, 'articleType')}</select></div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Descripción *</label><textarea id="description" required class="mt-1 block w-full border-gray-300 rounded border p-2">${val('description')}</textarea></div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Uso destinado *</label><textarea id="intendedUse" required class="mt-1 block w-full border-gray-300 rounded border p-2">${val('intendedUse')}</textarea></div>
                    <div><label class="block text-sm font-medium">Tamaño de partícula</label><input type="text" id="particleSize" value="${val('particleSize')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                    <div><label class="block text-sm font-medium">Working estándar *</label><select id="workingStandard" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option><option value="SI" ${val('workingStandard')==='SI'?'selected':''}>SI</option><option value="NO" ${val('workingStandard')==='NO'?'selected':''}>NO</option></select></div>
                    <div><label class="block text-sm font-medium">N° CAS</label><input type="text" id="casNumber" value="${val('casNumber')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                    <div><label class="block text-sm font-medium">Cant. lotes industriales</label><input type="number" id="industrialLotQuantity" step="0.01" value="${val('industrialLotQuantity')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                </div></div>

                <div class="bg-white rounded-lg shadow-sm border"><div class="bg-gray-50 px-6 py-4 border-b"><h3 class="font-semibold">Observaciones</h3></div>
                <div class="p-6"><textarea id="observations" class="mt-1 block w-full border-gray-300 rounded border p-2">${val('observations')}</textarea></div></div>

                <div class="fixed bottom-0 left-0 md:left-64 right-0 bg-white border-t p-4 flex justify-end gap-4 shadow-lg z-20">
                    <button type="button" onclick="submitForm('draft')" class="bg-white border text-gray-700 px-6 py-2 rounded-md shadow-sm font-medium">Guardar Borrador</button>
                    <button type="button" onclick="submitForm('send')" class="bg-primary text-white px-6 py-2 rounded-md shadow-sm font-medium">${isObserved ? 'Enviar Subsanación' : 'Enviar a Aprobación'}</button>
                </div>
            </form>
        </div>
    `;
}

function renderDetail(id) {
    const req = db.requests.find(r => r.id === id);
    if (!req) return renderDashboard();

    let actionsHtml = '';
    const actBox = (btns) => `<div class="mt-8 pt-6 border-t flex justify-end gap-3">${btns}</div>`;

    if (currentUser.role === ROLES.ANDF_ADF && (req.status === STATUS.BORRADOR || req.status === STATUS.OBSERVADO)) {
        actionsHtml = actBox(`<button onclick="navigateTo('form', '${req.id}')" class="bg-blue-600 text-white px-4 py-2 rounded">Editar / Subsanar</button>`);
    } else if (currentUser.role === ROLES.SGID_CDF && req.status === STATUS.EN_REVISION) {
        actionsHtml = actBox(`
            <button onclick="handleAction('${req.id}', 'cancelar')" class="bg-gray-100 px-4 py-2 rounded border">Cancelar</button>
            <button onclick="handleAction('${req.id}', 'observar')" class="bg-red-600 text-white px-4 py-2 rounded">Observar</button>
            <button onclick="handleAction('${req.id}', 'aprobar_sgid')" class="bg-green-600 text-white px-4 py-2 rounded">Aprobar</button>
        `);
    } else if (currentUser.role === ROLES.LOG && req.status === STATUS.APROBACION_PENDIENTE_LOG) {
        actionsHtml = actBox(`
            <button onclick="handleAction('${req.id}', 'observar')" class="bg-red-600 text-white px-4 py-2 rounded">Observar</button>
            <button onclick="handleAction('${req.id}', 'aprobar_log')" class="bg-green-600 text-white px-4 py-2 rounded">Aprobar</button>
        `);
    }

    const hist = db.history.filter(h => h.requestId === req.id).sort((a,b) => b.id.localeCompare(a.id));
    const creator = db.history.find(h => h.requestId === req.id && h.action === 'crear');
    const approvers = db.history.filter(h => h.requestId === req.id && h.action === 'aprobar');
    const auditSummary = `<div class="mb-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm"><div class="rounded bg-blue-50 border border-blue-100 p-3"><span class="block text-xs uppercase text-blue-700 font-semibold">Creado por</span><span class="font-medium">${creator ? creator.userName : '-'}</span></div><div class="rounded bg-green-50 border border-green-100 p-3"><span class="block text-xs uppercase text-green-700 font-semibold">Aprobaciones</span><span class="font-medium">${approvers.length ? approvers.map(h => h.userName).join(' · ') : 'Pendiente'}</span></div></div>`;
    const historyHtml = hist.map(h => `
        <li class="relative pb-5">
            <div class="relative flex space-x-3">
                <div class="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                    <div><p class="text-sm text-gray-500"><span class="font-medium text-gray-900">${h.userName}</span> ${h.action === 'crear' ? 'creó el requerimiento' : h.action === 'aprobar' ? 'aprobó el requerimiento' : h.action === 'cancelar' ? 'canceló el requerimiento' : 'registró la acción'}: ${getStatusBadge(h.newStatus)}</p>
                    ${h.comment ? `<p class="mt-1 text-sm bg-gray-50 p-2 rounded border">"${h.comment}"</p>` : ''}</div>
                    <div class="text-right text-xs text-gray-500">${h.timestamp}</div>
                </div>
            </div>
        </li>`).join('');

    const Field = (lbl, val) => `<div><dt class="text-xs font-medium text-gray-500 uppercase">${lbl}</dt><dd class="mt-1 text-sm font-medium">${val || '-'}</dd></div>`;
    const tabClass = (tab) => detailTab === tab ? 'border-primary text-primary bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300';
    const timelineHtml = [...hist].reverse().map((h, index) => `
        <li class="relative pl-8 ${index < hist.length - 1 ? 'pb-8' : ''}">
            <span class="absolute left-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white"><i class="fas ${h.action === 'aprobar' ? 'fa-check' : h.action === 'cancelar' ? 'fa-ban' : 'fa-circle'} text-[8px]"></i></span>
            <p class="text-sm font-semibold text-gray-900">${h.action === 'crear' ? 'Requerimiento creado' : h.action === 'aprobar' ? 'Requerimiento aprobado' : h.action === 'cancelar' ? 'Requerimiento cancelado' : h.action === 'observar' ? 'Requerimiento observado' : 'Estado actualizado'}</p>
            <p class="text-sm text-gray-600">${h.userName} · ${h.timestamp}</p>
            <p class="mt-1 text-xs font-medium text-primary">${h.requestCode || req.reqNumber} · ${h.newStatus}</p>
            ${h.comment ? `<p class="mt-2 text-sm text-gray-600">${h.comment}</p>` : ''}
        </li>`).join('');

    return `
        <div class="max-w-5xl mx-auto pb-10">
            <div class="mb-6 flex justify-between items-start">
                <div class="flex items-center gap-3"><button onclick="navigateTo('dashboard')" class="bg-white p-2 rounded-full border"><i class="fas fa-arrow-left"></i></button>
                <div><h1 class="text-2xl font-bold flex items-center gap-3">${req.reqNumber} ${getStatusBadge(req.status)}</h1></div></div>
            </div>
            
            <div class="mb-6 border-b border-gray-200 flex gap-1 overflow-x-auto">
                <button onclick="setDetailTab('detail')" class="px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tabClass('detail')}"><i class="fas fa-file-alt mr-2"></i>Detalle del requerimiento</button>
                <button onclick="setDetailTab('history')" class="px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tabClass('history')}"><i class="fas fa-history mr-2"></i>Bitácora</button>
                <button onclick="setDetailTab('flow')" class="px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tabClass('flow')}"><i class="fas fa-route mr-2"></i>Flujo de revisión</button>
            </div>

            <div class="${detailTab === 'detail' ? '' : 'hidden'} bg-white shadow rounded-lg border">
                <div class="px-4 py-5 bg-gray-50 border-b"><h3 class="text-lg font-medium">Detalle del Requerimiento</h3></div>
                <div class="p-6">
                    <dl class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 border-b pb-6">
                        ${Field('Tipo', req.articleType)} ${Field('Cantidad', req.sampleQuantity + ' ' + req.unit)} ${Field('Prioridad', req.priority)}
                        ${Field('Gestión de proveedores', req.supplierStrategy === 'PROVEEDOR_EXISTENTE' ? 'Proveedor existente' : req.supplierStrategy === 'NUEVOS_PROVEEDORES' ? 'Buscar nuevos proveedores' : '-')}
                        <div class="md:col-span-3">${Field('Descripción', req.description)}</div>
                    </dl>
                    <dl class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 border-b pb-6">
                        ${Field('Producto', req.productName)} ${Field('Categoría', req.category)} ${Field('Forma', req.pharmaceuticalForm)} ${Field('Resp.', req.responsible)}
                    </dl>
                    <dl class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        ${Field('Partícula', req.particleSize)} ${Field('Working Std.', req.workingStandard)} ${Field('CAS', req.casNumber)}
                        <div class="md:col-span-3">${Field('Uso', req.intendedUse)}</div>
                    </dl>
                </div>
            </div>
            ${detailTab === 'detail' ? actionsHtml : ''}
            <div class="${detailTab === 'history' ? '' : 'hidden'} mt-8 bg-white shadow rounded-lg border">
                <div class="px-4 py-5 bg-gray-50 border-b"><h3 class="text-lg font-medium">Bitácora del requerimiento</h3></div>
                <div class="p-6">${auditSummary}<ul class="ml-3 border-l-2 border-blue-200 pl-5">${historyHtml}</ul></div>
            </div>
            <div class="${detailTab === 'flow' ? '' : 'hidden'} bg-white shadow rounded-lg border p-6">
                <h3 class="text-xl font-bold text-gray-900">Flujo de revisión</h3>
                <p class="mt-1 text-sm text-gray-500">Línea de tiempo completa del requerimiento.</p>
                <ol class="mt-8 ml-2 border-l-2 border-blue-200">${timelineHtml}</ol>
            </div>
        </div>
    `;
}

// --- 6. ACTION HANDLERS ---
let formSubmitIntent = null;
function submitForm(intent) {
    formSubmitIntent = intent;
    const form = document.getElementById('req-form');
    if (form.checkValidity()) {
        if (intent === 'send') openModal('Enviar a aprobación', '<p>¿Está seguro de enviar este requerimiento?</p>', executeFormSave);
        else executeFormSave();
    } else form.reportValidity();
}

function handleFormSubmit(e) { e.preventDefault(); submitForm(formSubmitIntent || 'draft'); }

async function executeFormSave() {
    const data = {
        id: document.getElementById('req-id').value || null,
        articleType: document.getElementById('articleType').value,
        description: document.getElementById('description').value,
        sampleQuantity: document.getElementById('sampleQuantity').value,
        unit: document.getElementById('unit').value,
        priority: document.getElementById('priority').value,
        supplierStrategy: document.getElementById('supplierStrategy').value,
        productName: document.getElementById('productName').value,
        category: document.getElementById('category').value,
        pharmaceuticalForm: document.getElementById('pharmaceuticalForm').value,
        responsible: document.getElementById('responsible').value,
        intendedUse: document.getElementById('intendedUse').value,
        particleSize: document.getElementById('particleSize').value,
        workingStandard: document.getElementById('workingStandard').value,
        casNumber: document.getElementById('casNumber').value,
        industrialLotQuantity: document.getElementById('industrialLotQuantity').value,
        observations: document.getElementById('observations').value,
    };

    if (formSubmitIntent === 'draft') { data.status = STATUS.BORRADOR; data._comment = 'Guardado como borrador'; } 
    else if (formSubmitIntent === 'send') { data.status = STATUS.EN_REVISION; data._comment = 'Enviado a revisión SGID/CDF'; }

    try {
        const saved = await saveRequest(data, data.id ? 'guardar' : 'crear');
        if (saved) { showToast('Acción exitosa'); navigateTo('dashboard'); }
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function handleAction(reqId, actionStr) {
    if (actionStr === 'aprobar_sgid') openModal('Aprobar', '<p>Se derivará a LOG.</p>', () => changeStatus(reqId, STATUS.APROBACION_PENDIENTE_LOG, 'aprobar', 'Aprobado SGID'));
    else if (actionStr === 'aprobar_log') openModal('Aprobar (LOG)', '<p>Aprobación final.</p>', () => changeStatus(reqId, STATUS.APROBADO, 'aprobar', 'Aprobado LOG'));
    else if (actionStr === 'cancelar') {
        openModal('Cancelar requerimiento', '<p class="mb-3">El requerimiento se marcará como cancelado y quedará registrado en la bitácora.</p><textarea id="cancel-comment" placeholder="Motivo de cancelación (obligatorio)" class="w-full border rounded p-2"></textarea>', () => {
            const comment = document.getElementById('cancel-comment').value.trim();
            if (comment) changeStatus(reqId, STATUS.CANCELADO, 'cancelar', comment);
            else showToast('El motivo de cancelación es obligatorio', 'error');
        }, 'Cancelar requerimiento', true);
    }
    else if (actionStr === 'observar') {
        openModal('Observar', '<textarea id="obs-comment" class="w-full border rounded p-2"></textarea>', () => {
            const c = document.getElementById('obs-comment').value;
            if(c) changeStatus(reqId, STATUS.OBSERVADO, 'observar', c); else showToast('Comentario obligatorio', 'error');
        }, 'Registrar', true);
    }
}

async function changeStatus(reqId, newStatus, action, comment) {
    const req = db.requests.find(r => r.id === reqId);
    try {
        await saveRequest({ ...req, status: newStatus, _comment: comment }, action);
        showToast(`Estado: ${newStatus}`);
        navigateTo('dashboard');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// --- 7. AUTH & HELPERS ---
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
        const response = await fetch('/api/bioreq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username, password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesión.');
        currentUser = result.user;
        currentSessionToken = result.sessionToken;
        document.getElementById('login-error').classList.add('hidden');
        try {
            await loadDatabase();
            currentView = 'dashboard';
            renderApp();
        } catch (error) {
            document.getElementById('login-error').textContent = error.message;
            document.getElementById('login-error').classList.remove('hidden');
            currentUser = null;
            currentSessionToken = null;
        }
    } catch (error) {
        document.getElementById('login-error').textContent = error.message === 'Credenciales inválidas.' ? error.message : 'Credenciales incorrectas';
        document.getElementById('login-error').classList.remove('hidden');
    }
}
function fillLogin(user) { document.getElementById('username').value = user; document.getElementById('password').value = '123'; }
function logout() { currentUser = null; currentSessionToken = null; currentView = 'dashboard'; renderApp(); }
function getLastObservation(reqId) { const obs = db.history.filter(h => h.requestId === reqId && h.newStatus === STATUS.OBSERVADO).reverse(); return obs.length ? obs[0].comment : ''; }

window.onload = renderApp;
