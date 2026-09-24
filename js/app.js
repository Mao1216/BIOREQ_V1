// --- 2. UTILITY FUNCTIONS ---
let draftCodePreview = 'TEM-Generando...';
let autosaveTimer = null;
let autosaveInProgress = false;
let autosaveDirty = false;
let formSubmissionInProgress = false;
let loadingRequests = 0;
let loadingTimer = null;

function beginLoading(message = 'Actualizando información…') {
    loadingRequests += 1;
    const indicator = document.getElementById('loading-indicator');
    const label = document.getElementById('loading-indicator-label');
    if (!indicator || !label) return;

    label.textContent = message;
    clearTimeout(loadingTimer);
    // Evita mostrar el indicador en operaciones casi instantáneas.
    loadingTimer = setTimeout(() => {
        if (loadingRequests > 0) indicator.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
    }, 180);
}

function endLoading() {
    loadingRequests = Math.max(0, loadingRequests - 1);
    if (loadingRequests > 0) return;
    clearTimeout(loadingTimer);
    document.getElementById('loading-indicator')?.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
}

async function withLoading(task, message) {
    beginLoading(message);
    try {
        return await task();
    } finally {
        endLoading();
    }
}

async function loadDatabase() {
    return withLoading(async () => {
        const response = await fetch('/api/bioreq');
        if (!response.ok) throw new Error('No se pudo cargar la información de Supabase.');
        const data = await response.json();
        db.requests = data.requests;
        db.history = data.history;
        const catalogResponse = await fetch('/api/bioreq?catalog=1');
        if (catalogResponse.ok) db.catalogItems = (await catalogResponse.json()).items || [];
        const suppliersResponse = await fetch('/api/bioreq?suppliers=1');
        if (suppliersResponse.ok) db.suppliers = (await suppliersResponse.json()).items || [];
        const registrationsResponse = await fetch('/api/bioreq?providerRegistrations=1');
        if (registrationsResponse.ok) db.providerRegistrations = (await registrationsResponse.json()).items || [];
        const searchesResponse = await fetch('/api/bioreq?supplierSearches=1');
        if (searchesResponse.ok) db.supplierSearches = (await searchesResponse.json()).items || [];
    }, 'Actualizando información…');
}

async function loadDraftCodePreview() {
    try {
        const response = await fetch('/api/bioreq?preview=TEM');
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
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds}`;
}

function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const local = new Date(date.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    return `${String(local.getDate()).padStart(2, '0')}/${String(local.getMonth() + 1).padStart(2, '0')}/${local.getFullYear()} - ${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}:${String(local.getSeconds()).padStart(2, '0')}`;
}

function areaForRole(role) {
    return ({ ANDF_ADF: 'Desarrollo Farmacéutico', SGID_CDF: 'Investigación y Desarrollo', LOG: 'Logística', SUPER_ADMIN: 'SIG' })[role] || role || '';
}

function personWithArea(name, role) {
    // Las fichas antiguas pueden contener siglas entre paréntesis junto al nombre.
    // Se muestran solo el nombre y el área para mantener una presentación uniforme.
    const cleanName = String(name || 'Usuario').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    const area = areaForRole(role);
    return area ? `${cleanName} · ${area}` : cleanName;
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
    const label = status === STATUS.APROBACION_PENDIENTE_LOG ? 'EN REVISIÓN' : status;
    return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${classes}">${label}</span>`;
}

function getPriorityBadge(priorityId) {
    if(!priorityId) return '-';
    const p = LISTS.priorities.find(x => x.id === priorityId);
    return `<span class="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${p.color}" title="${p.desc}">Prioridad ${p.label}</span>`;
}

// --- 3. DATABASE OPERATIONS ---
async function saveRequest(data, action) {
    return withLoading(async () => {
        const response = await fetch('/api/bioreq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, action, user: currentUser })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar el requerimiento.');
        await loadDatabase();
        return result.request;
    }, 'Guardando cambios…');
}

async function saveProviderRegistration(provider) {
    return withLoading(async () => {
        const response = await fetch('/api/bioreq', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: provider, action: 'save_provider' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar el proveedor.');
        await loadDatabase();
        return result.provider;
    }, 'Guardando proveedor…');
}

async function notifyRequesterByEmail(requestId) {
    return withLoading(async () => {
        const response = await fetch('/api/bioreq', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { requestId }, action: 'notify_requester' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo registrar la notificación.');
        return result;
    }, 'Enviando notificación…');
}

async function updateProviderStatus(providerId, status, action, comment = '') {
    return withLoading(async () => {
        const response = await fetch('/api/bioreq', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { providerId, status, action, comment }, action: 'update_provider_status' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo actualizar el proveedor.');
        await loadDatabase();
        return result.provider;
    }, 'Actualizando proveedor…');
}

async function updateSupplierSearch(requestId, operation) {
    return withLoading(async () => {
        const response = await fetch('/api/bioreq', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { requestId, operation }, action: 'update_supplier_search' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la búsqueda de proveedores.');
        await loadDatabase();
        return result.search;
    }, 'Actualizando búsqueda…');
}

function getRequestsByRole() {
    if (!currentUser) return [];
    if (currentUser.role === ROLES.SUPER_ADMIN) return db.requests;
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
    document.getElementById('modal-confirm').onclick = async () => {
        const confirmButton = document.getElementById('modal-confirm');
        confirmButton.disabled = true;
        confirmButton.classList.add('opacity-60', 'cursor-wait');
        try {
            // Las acciones de aprobación se guardan en Supabase. Esperamos la
            // respuesta antes de cerrar el cuadro para no ocultar un error.
            await onConfirm();
            container.classList.add('hidden');
        } catch (error) {
            showToast(error.message || 'No se pudo completar la acción.', 'error');
            confirmButton.disabled = false;
            confirmButton.classList.remove('opacity-60', 'cursor-wait');
        }
    };
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

function canEditOwnDraft(request) {
    if (!request || currentUser?.role !== ROLES.ANDF_ADF) return false;
    if (![STATUS.BORRADOR, STATUS.OBSERVADO].includes(request.status)) return false;
    return request.requesterId === currentUser.id;
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
    if (currentUser.isSig && (!currentUser.activeRole || sigRoleChooserOpen)) {
        app.innerHTML = renderSigRoleChooser();
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
                        <p class="text-xs text-blue-300 truncate">${areaForRole(currentUser.role)}</p>
                    </div>
                </div>
            </div>
            <nav class="flex-1 px-4 py-4 space-y-1 overflow-y-auto">${renderSidebarMenu()}</nav>
            <div class="p-4 border-t border-gray-700">
                ${currentUser.isSig ? `<button onclick="openSigRoleChooser()" class="mb-2 flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-blue-300 hover:text-white hover:bg-gray-700 rounded-md"><i class="fas fa-user-shield w-5"></i> Cambiar perfil</button>` : ''}
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
    if (currentView === 'form') setupFormAutosave();
}

function renderSidebarMenu() {
    let menu = '';
    const isActive = (v) => currentView === v ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white';
    const baseClass = "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors w-full text-left cursor-pointer";

    menu += `<a onclick="navigateTo('dashboard')" class="${baseClass} ${isActive('dashboard')} mb-2"><i class="fas fa-chart-line w-6 text-center mr-2"></i> Monitor</a>`;
    if (currentUser.role === ROLES.ANDF_ADF) {
        menu += `
            <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-4 mb-2">Acciones</div>
            <a onclick="navigateTo('form')" class="${baseClass} ${isActive('form')}"><i class="fas fa-plus-circle w-6 text-center mr-2"></i> Nuevo Requerimiento</a>
            <a onclick="navigateTo('provider-requests')" class="${baseClass} ${isActive('provider-requests')}"><i class="fas fa-clipboard-list w-6 text-center mr-2"></i> Requerimientos</a>
            <a onclick="navigateTo('provider-review')" class="${baseClass} ${isActive('provider-review')}"><i class="fas fa-building w-6 text-center mr-2"></i> Proveedores en revisión</a>
        `;
    }
    if (currentUser.role === ROLES.LOG) {
        menu += `
            <a onclick="navigateTo('approved-providers')" class="${baseClass} ${isActive('approved-providers')}"><i class="fas fa-check-circle w-6 text-center mr-2"></i> Aprobadas</a>
        `;
    }
    return menu;
}

function renderCurrentView() {
    switch(currentView) {
        case 'dashboard': return renderDashboard();
        case 'form': return renderForm();
        case 'detail': return renderDetail(viewContextId);
        case 'approved-providers': return renderApprovedProviders();
        case 'request-providers': return renderRequestProviders(viewContextId);
        case 'provider-review': return renderProviderReview();
        case 'provider-requests': return renderProviderRequests();
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
                <div class="mt-8 space-y-4">
                    <div id="login-error" class="hidden text-sm text-red-600 text-center font-medium"></div>
                    <button onclick="loginWithMicrosoft()" class="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 shadow-sm"><i class="fab fa-microsoft text-blue-600"></i> Continuar con Microsoft</button>
                    <p class="text-xs text-center text-gray-500">Acceso exclusivo para cuentas autorizadas de Biomont.</p>
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
    else if (currentUser.role === ROLES.LOG) {
        tableTitle = 'Solicitudes Derivadas';
        // Las aprobadas se administran desde la sección independiente "Aprobadas".
        tableData = tableData.filter(request => request.status === STATUS.APROBACION_PENDIENTE_LOG);
    }

    // Filters
    if (currentFilters.num) tableData = tableData.filter(r => r.reqNumber.toLowerCase().includes(currentFilters.num));
    if (currentFilters.prod) tableData = tableData.filter(r => (r.productName||'').toLowerCase().includes(currentFilters.prod));
    if (currentFilters.status) tableData = tableData.filter(r => r.status === currentFilters.status);
    if (currentFilters.priority) tableData = tableData.filter(r => r.priority === currentFilters.priority);
    if (currentFilters.type) tableData = tableData.filter(r => r.articleType === currentFilters.type);

    let filterHtml = '';
    if (currentUser.role) {
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
                <div><h1 class="text-2xl font-bold">Monitor</h1><p class="text-sm text-gray-500">Bienvenido, ${personWithArea(currentUser.name, currentUser.role)}</p></div>
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
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${tableData.length === 0 ? `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-500 text-sm">No hay solicitudes.</td></tr>` :
                            tableData.map(req => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap"><div class="font-medium">${req.reqNumber}</div><div class="text-xs text-gray-500">${formatDateTime(getMonitorTimestamp(req))}</div></td>
                                    <td class="px-6 py-4"><div class="text-sm font-medium truncate max-w-xs">${req.productName||'(Sin nombre)'}</div><div class="text-xs text-gray-500">${req.articleType||'-'}</div></td>
                                    <td class="px-6 py-4 whitespace-nowrap">${getPriorityBadge(req.priority)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap"><div class="flex items-center gap-3">${getStatusBadge(req.status)} ${canEditOwnDraft(req) ? `<button onclick="navigateTo('form', '${req.id}')" class="text-primary hover:bg-blue-50 px-2 py-1 rounded text-sm font-medium">Editar borrador <i class="fas fa-pen ml-1"></i></button>` : `<button onclick="navigateTo('detail', '${req.id}')" class="text-primary hover:bg-blue-50 px-2 py-1 rounded text-sm">Revisar <i class="fas fa-chevron-right ml-1"></i></button>`}</div></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function getMonitorTimestamp(req) {
    // Los borradores muestran su última edición; los enviados, el momento de envío a revisión.
    if (req.status === STATUS.BORRADOR) return req.updatedAt || req.createdAt || req.date;
    const sentEvent = db.history
        .filter(h => h.requestId === req.id && h.newStatus === STATUS.EN_REVISION)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    return sentEvent?.timestamp || req.updatedAt || req.createdAt || req.date;
}

function getProductCode(request) {
    const match = String(request?.productName || '').match(/^\s*([A-Za-z0-9-]+)\s+-\s+/);
    return match?.[1] || '';
}

function providerDocumentChecklist(documents = []) {
    const expected = ['COA', 'Ficha técnica', 'Hoja de seguridad'];
    return `<div class="mt-3 text-xs text-gray-600 space-y-1">${expected.map(type => {
        const exists = documents.some(document => document.documentType === type);
        return `<div class="flex items-center gap-2"><i class="fas ${exists ? 'fa-check-square text-green-600' : 'fa-square text-gray-300'}"></i>${type}</div>`;
    }).join('')}</div>`;
}

function getProviderStatusBadge(status = 'BORRADOR') {
    const styles = {
        BORRADOR: 'bg-gray-100 text-gray-700',
        'EN EVALUACIÓN DF': 'bg-blue-50 text-blue-700',
        OBSERVADO: 'bg-amber-50 text-amber-700',
        RECHAZADO: 'bg-red-50 text-red-700',
        'EN REVISIÓN': 'bg-purple-50 text-purple-700'
    };
    return `<span class="inline-flex rounded px-2 py-1 text-xs font-medium ${styles[status] || styles.BORRADOR}">${status}</span>`;
}

function getSupplierSearch(requestId) {
    return db.supplierSearches.find(search => search.requestId === requestId) || { requestId, status: 'ABIERTO', openedAt: null, sentToDfAt: null };
}

function getSupplierSearchBadge(status = 'ABIERTO') {
    const styles = {
        ABIERTO: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
        CERRADO: 'bg-slate-100 text-slate-700 ring-slate-600/20',
        REABIERTO: 'bg-amber-50 text-amber-700 ring-amber-600/20'
    };
    const labels = { ABIERTO: 'Abierto', CERRADO: 'Cerrado', REABIERTO: 'Reabierto' };
    return `<span class="inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${styles[status] || styles.ABIERTO}">${labels[status] || 'Abierto'}</span>`;
}

function renderApprovedProviders() {
    if (![ROLES.LOG, ROLES.SUPER_ADMIN].includes(currentUser?.role)) return '<p class="text-sm text-gray-500">No tienes acceso a esta sección.</p>';
    const approved = db.requests.filter(request => request.status === STATUS.APROBADO).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return `
        <div class="max-w-7xl mx-auto">
            <div class="flex items-end justify-between mb-6"><div><h1 class="text-2xl font-bold">Aprobadas</h1><p class="text-sm text-gray-500">Gestión de proveedores para requerimientos aprobados.</p></div><button onclick="navigateTo('dashboard')" class="text-sm text-primary font-medium"><i class="fas fa-arrow-left mr-1"></i> Solicitudes derivadas</button></div>
            <div class="bg-white rounded-lg shadow border border-gray-200 overflow-hidden"><div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50"><tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">N° Solicitud / Fecha</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto / Artículo</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado del requerimiento</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedores</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th></tr></thead><tbody class="divide-y divide-gray-200">${approved.length ? approved.map(request => {
                const count = db.providerRegistrations.filter(provider => provider.requestId === request.id).length;
                const search = getSupplierSearch(request.id);
                return `<tr class="hover:bg-gray-50"><td class="px-6 py-4 whitespace-nowrap"><div class="font-medium">${request.reqNumber}</div><div class="text-xs text-gray-500">${formatDateTime(request.updatedAt || request.createdAt)}</div></td><td class="px-6 py-4"><div class="text-sm font-medium">${request.productName || '(Sin nombre)'}</div><div class="text-xs text-gray-500">${request.articleType || '-'}</div></td><td class="px-6 py-4">${getStatusBadge(request.status)}</td><td class="px-6 py-4"><button onclick="navigateTo('request-providers','${request.id}')" title="Ver proveedores" class="inline-flex items-center gap-2 text-primary hover:bg-blue-50 px-3 py-2 rounded-md text-sm font-medium"><i class="fas fa-eye"></i> Ver${count ? ` <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs">${count}</span>` : ''}</button></td><td class="px-6 py-4">${getSupplierSearchBadge(search.status)}</td></tr>`;
            }).join('') : '<tr><td colspan="5" class="px-6 py-10 text-center text-sm text-gray-500">Aún no hay solicitudes aprobadas.</td></tr>'}</tbody></table></div></div>
        </div>`;
}

function renderRequestProviders(requestId) {
    const request = db.requests.find(item => item.id === requestId);
    if (!request) return '<p class="text-sm text-gray-500">No se encontró el requerimiento.</p>';
    const productCode = getProductCode(request);
    const ownProviders = db.providerRegistrations.filter(provider => provider.requestId === requestId);
    const previousProviders = productCode ? db.providerRegistrations.filter(provider => provider.productCode === productCode && provider.requestId !== requestId) : [];
    const providers = [...ownProviders, ...previousProviders.filter(provider => !ownProviders.some(own => own.id === provider.id))];
    const search = getSupplierSearch(requestId);
    const pendingProviders = ownProviders.filter(provider => ['BORRADOR', 'OBSERVADO'].includes(provider.status || 'BORRADOR'));
    const isClosed = search.status === 'CERRADO';
    const providerCards = providers.length ? providers.map(provider => {
        const isOwn = provider.requestId === requestId;
        return `<article class="bg-white rounded-lg border shadow-sm p-5"><div class="flex items-start justify-between gap-3"><div><h2 class="font-semibold text-lg">${provider.supplierName}</h2><p class="text-xs text-gray-500">${provider.manufacturer || 'Fabricante no registrado'} · ${provider.origin || 'Origen no registrado'}</p><p class="mt-1 text-xs text-gray-400"><i class="far fa-calendar-plus mr-1"></i>Añadido el ${formatDateTime(provider.createdAt)}</p></div>${getProviderStatusBadge(provider.status)}</div><div class="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p class="text-xs text-gray-500">MOQ / costo</p><p>${(provider.moqs || []).map(item => `${item.quantity || '-'} ${provider.currency || ''} ${item.cost ? `· ${item.cost}` : ''}`).join('<br>') || '-'}</p></div><div><p class="text-xs text-gray-500">Tiempo de envío</p><p>${provider.deliveryTime || '-'}</p></div></div>${providerDocumentChecklist(provider.documentation)}${isOwn ? `<div class="mt-4 flex flex-wrap justify-end gap-3"><button onclick="openDocumentationModal('${provider.id}')" class="text-sm text-primary font-medium"><i class="fas fa-paperclip mr-1"></i> Añadir documentación</button>${!isClosed && ['BORRADOR', 'OBSERVADO'].includes(provider.status || 'BORRADOR') ? `<button onclick="notifyProviderToDf('${provider.id}')" class="text-sm text-sidebar font-medium"><i class="fas fa-bell mr-1"></i> Notificar</button>` : ''}</div>` : ''}</article>`;
    }).join('') : '<div class="lg:col-span-2 rounded-lg border border-dashed bg-white py-14 text-center text-sm text-gray-500"><i class="fas fa-building text-2xl text-gray-300 mb-3 block"></i>Aún no se han registrado proveedores para este requerimiento.</div>';
    let mainAction = '';
    if (isClosed) mainAction = `<button onclick="reopenSupplierSearch('${request.id}', 'logistics')" class="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"><i class="fas fa-rotate-right"></i> Reabrir búsqueda</button>`;
    else if (pendingProviders.length) mainAction = `<button onclick="sendRequestProvidersToDf('${request.id}')" class="inline-flex items-center gap-2 rounded-md bg-sidebar px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"><i class="fas fa-share"></i> Enviar a revisión DF</button>`;
    else if (search.sentToDfAt) mainAction = `<button onclick="closeSupplierSearch('${request.id}')" class="inline-flex items-center gap-2 rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"><i class="fas fa-lock"></i> Cerrar búsqueda</button>`;
    return `
        <div class="max-w-6xl mx-auto">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-7"><div><button onclick="navigateTo('approved-providers')" class="text-sm text-primary font-medium mb-3"><i class="fas fa-arrow-left mr-1"></i> Aprobadas</button><h1 class="text-2xl font-bold">Proveedores</h1><p class="mt-1 text-sm text-gray-500"><span class="font-semibold text-gray-700">${request.reqNumber}</span> · ${request.productName || '(Sin producto)'}</p><p class="text-sm text-gray-500">${request.requirementDescription || request.description || ''}</p><div class="mt-2">${getSupplierSearchBadge(search.status)}</div></div>${!isClosed ? `<button onclick="openProviderRegistration('${request.id}')" class="bg-primary hover:bg-primaryHover text-white px-4 py-2 rounded-md shadow text-sm font-medium"><i class="fas fa-plus mr-1"></i> Agregar proveedor</button>` : ''}</div>
            ${previousProviders.length && !ownProviders.length ? '<div class="mb-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"><i class="fas fa-history mr-2"></i>Se muestran automáticamente proveedores registrados anteriormente para este producto. Puedes añadir alternativas nuevas.</div>' : ''}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">${providerCards}</div>
            <div class="mt-8 flex justify-end">${mainAction}</div>
        </div>`;
}

function addMoqField(quantity = '', cost = '') {
    const container = document.getElementById('provider-moqs');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'provider-moq-row grid grid-cols-[1fr_1fr_auto] gap-2';
    row.innerHTML = `<input type="text" value="${quantity}" placeholder="MOQ" class="provider-moq border rounded p-2 text-sm"><input type="text" value="${cost}" placeholder="Costo" class="provider-cost border rounded p-2 text-sm"><button type="button" onclick="this.parentElement.remove()" class="text-gray-400 hover:text-red-600 px-2"><i class="fas fa-times"></i></button>`;
    container.appendChild(row);
}

function openProviderRegistration(requestId) {
    const request = db.requests.find(item => item.id === requestId);
    if (!request) return;
    openModal('Agregar proveedor', `<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm"><div class="md:col-span-2 rounded bg-gray-50 p-3 text-gray-600"><span class="font-medium">${request.reqNumber}</span> · ${request.productName || '(Sin producto)'}</div><div><label class="block mb-1 font-medium">Fecha</label><input disabled value="${getCurrentDateTime()}" class="w-full border rounded p-2 bg-gray-100 text-gray-500"></div><div><label class="block mb-1 font-medium">Proveedor *</label><input id="provider-name" class="w-full border rounded p-2" placeholder="Nombre del proveedor"></div><div><label class="block mb-1 font-medium">Fabricante</label><input id="provider-manufacturer" class="w-full border rounded p-2"></div><div><label class="block mb-1 font-medium">Origen</label><input id="provider-origin" class="w-full border rounded p-2"></div><div class="md:col-span-2"><label class="block mb-1 font-medium">Cantidades mínimas de compra</label><div id="provider-moqs" class="space-y-2"><div class="provider-moq-row grid grid-cols-[1fr_1fr_auto] gap-2"><input class="provider-moq border rounded p-2" placeholder="MOQ 1"><input class="provider-cost border rounded p-2" placeholder="Costo 1"><span></span></div></div><button type="button" onclick="addMoqField()" class="mt-2 text-xs text-primary font-medium">+ Añadir MOQ</button></div><div><label class="block mb-1 font-medium">Moneda</label><select id="provider-currency" class="w-full border rounded p-2"><option value="">Seleccione</option><option>PEN</option><option>USD</option><option>EUR</option></select></div><div><label class="block mb-1 font-medium">Tiempo de envío</label><input id="provider-delivery" class="w-full border rounded p-2" placeholder="Ej. 30 días"></div><div><label class="block mb-1 font-medium">Tipo de OC (según Oracle)</label><select id="provider-oc" class="w-full border rounded p-2"><option>Importación</option><option>Nacional</option></select></div><div><label class="block mb-1 font-medium">Condición de pago</label><input id="provider-payment" class="w-full border rounded p-2"></div><div><label class="block mb-1 font-medium">Tipo de comprobante</label><input id="provider-invoice" class="w-full border rounded p-2"></div><div><label class="block mb-1 font-medium">Incoterm</label><input id="provider-incoterm" class="w-full border rounded p-2"></div><div><label class="block mb-1 font-medium">Working estándar</label><select id="provider-working" class="w-full border rounded p-2"><option value="">Seleccione</option><option>Sí</option><option>No</option></select></div><div><label class="block mb-1 font-medium">Costo de W/S</label><input id="provider-ws-cost" class="w-full border rounded p-2"></div><div class="md:col-span-2"><label class="block mb-1 font-medium">Observaciones</label><textarea id="provider-observations" class="w-full border rounded p-2" rows="2"></textarea></div></div>`, async () => {
        const moqs = [...document.querySelectorAll('.provider-moq-row')].map(row => ({ quantity: row.querySelector('.provider-moq').value.trim(), cost: row.querySelector('.provider-cost').value.trim() })).filter(item => item.quantity || item.cost);
        const provider = await saveProviderRegistration({ requestId, productCode: getProductCode(request), supplierName: document.getElementById('provider-name').value, manufacturer: document.getElementById('provider-manufacturer').value, origin: document.getElementById('provider-origin').value, moqs, currency: document.getElementById('provider-currency').value, deliveryTime: document.getElementById('provider-delivery').value, purchaseOrderType: document.getElementById('provider-oc').value, paymentTerms: document.getElementById('provider-payment').value, invoiceType: document.getElementById('provider-invoice').value, incoterm: document.getElementById('provider-incoterm').value, workingStandard: document.getElementById('provider-working').value, wsCost: document.getElementById('provider-ws-cost').value, observations: document.getElementById('provider-observations').value, documentation: [] });
        showToast('Proveedor registrado. Ya puedes añadir su documentación.');
        navigateTo('request-providers', provider.requestId);
    }, 'Guardar proveedor');
}

function openDocumentationModal(providerId) {
    const provider = db.providerRegistrations.find(item => item.id === providerId);
    if (!provider) return;
    openModal('Añadir documentación', '<p class="mb-3 text-sm text-gray-600">Selecciona uno o varios tipos de documento y adjunta sus archivos en el mismo orden.</p><label class="block text-sm font-medium mb-1">Documentos</label><select id="provider-document-types" multiple class="w-full border rounded p-2 h-28"><option>COA</option><option>Ficha técnica</option><option>Hoja de seguridad</option><option>Otros documentos</option></select><label class="block text-sm font-medium mt-4 mb-1">Archivos</label><input id="provider-document-files" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" class="w-full text-sm"><p class="mt-2 text-xs text-gray-500">Máximo 1.5 MB por archivo.</p>', async () => {
        const types = [...document.getElementById('provider-document-types').selectedOptions].map(option => option.value);
        const files = [...document.getElementById('provider-document-files').files];
        if (!types.length || !files.length) throw new Error('Selecciona el tipo de documento y al menos un archivo.');
        if (types.length > 1 && types.length !== files.length) throw new Error('Para varios tipos, adjunta un archivo por cada tipo en el mismo orden.');
        const documents = await Promise.all(files.map((file, index) => new Promise((resolve, reject) => { if (file.size > 1.5 * 1024 * 1024) return reject(new Error(`${file.name} supera 1.5 MB.`)); const reader = new FileReader(); reader.onload = () => resolve({ documentType: types[types.length === 1 ? 0 : index], name: file.name, type: file.type, dataUrl: reader.result }); reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`)); reader.readAsDataURL(file); })));
        await saveProviderRegistration({ ...provider, documentation: [...(provider.documentation || []), ...documents] });
        showToast('Documentación añadida correctamente.');
        navigateTo('request-providers', provider.requestId);
    }, 'Guardar documentación');
}

function notifyProviderToDf(providerId) {
    openModal('Notificar a Desarrollo Farmacéutico', '<p class="text-sm text-gray-600">El proveedor pasará a evaluación de Desarrollo Farmacéutico.</p>', async () => {
        await updateProviderStatus(providerId, 'EN EVALUACIÓN DF', 'notificar_df', 'Proveedor enviado a evaluación de Desarrollo Farmacéutico.');
        showToast('Proveedor enviado a evaluación de Desarrollo Farmacéutico.');
        renderApp();
    }, 'Notificar');
}

async function sendRequestProvidersToDf(requestId) {
    const pending = db.providerRegistrations.filter(provider => provider.requestId === requestId && ['BORRADOR', 'OBSERVADO'].includes(provider.status || 'BORRADOR'));
    if (!pending.length) return showToast('No hay proveedores en borrador u observados para enviar.', 'warning');
    openModal('Enviar a revisión DF', `<p class="text-sm text-gray-600">Se enviarán ${pending.length} proveedor(es) a evaluación de Desarrollo Farmacéutico.</p>`, async () => {
        for (const provider of pending) await updateProviderStatus(provider.id, 'EN EVALUACIÓN DF', 'enviar_revision_df', 'Proveedor enviado a evaluación de Desarrollo Farmacéutico.');
        await updateSupplierSearch(requestId, 'send_to_df');
        showToast('Proveedores enviados a revisión DF.');
        navigateTo('request-providers', requestId);
    }, 'Enviar a revisión DF');
}

function closeSupplierSearch(requestId) {
    openModal('Cerrar búsqueda de proveedores', '<p class="text-sm text-gray-600">¿Confirmas que la búsqueda de proveedores concluyó? Una búsqueda cerrada no permitirá añadir proveedores hasta que se reabra.</p>', async () => {
        await updateSupplierSearch(requestId, 'close');
        showToast('Búsqueda de proveedores cerrada.');
        navigateTo('request-providers', requestId);
    }, 'Cerrar búsqueda', true);
}

function reopenSupplierSearch(requestId, source = 'logistics') {
    const message = source === 'df'
        ? '¿Deseas reabrir la selección de proveedores? Logística recibirá una notificación para continuar la búsqueda.'
        : '¿Deseas reabrir la búsqueda de proveedores? Podrás añadir y enviar nuevas alternativas a Desarrollo Farmacéutico.';
    openModal('Reabrir búsqueda de proveedores', `<p class="text-sm text-gray-600">${message}</p>`, async () => {
        await updateSupplierSearch(requestId, 'reopen');
        showToast(source === 'df' ? 'Búsqueda reabierta. Logística fue notificada.' : 'Búsqueda de proveedores reabierta.');
        navigateTo(source === 'df' ? 'provider-requests' : 'request-providers', source === 'df' ? null : requestId);
    }, 'Reabrir búsqueda');
}

function renderProviderReview() {
    const ownRequestIds = new Set(db.requests.filter(request => currentUser.isSig || request.requesterId === currentUser.id).map(request => request.id));
    const providers = db.providerRegistrations.filter(provider => ownRequestIds.has(provider.requestId) && provider.status === 'EN EVALUACIÓN DF');
    return `<div class="max-w-6xl mx-auto"><div class="mb-6"><h1 class="text-2xl font-bold">Proveedores en revisión</h1><p class="text-sm text-gray-500">Evalúa los proveedores enviados por Logística.</p></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-5">${providers.length ? providers.map(provider => { const request = db.requests.find(item => item.id === provider.requestId); return `<article class="bg-white rounded-lg border shadow-sm p-5"><div class="flex items-start justify-between gap-3"><div><h2 class="font-semibold text-lg">${provider.supplierName}</h2><p class="text-xs text-gray-500">${request?.reqNumber || ''} · ${request?.productName || ''}</p></div>${getProviderStatusBadge(provider.status)}</div><div class="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p class="text-xs text-gray-500">MOQ / costo</p><p>${(provider.moqs || []).map(item => `${item.quantity || '-'} ${provider.currency || ''} ${item.cost ? `· ${item.cost}` : ''}`).join('<br>') || '-'}</p></div><div><p class="text-xs text-gray-500">Tiempo de envío</p><p>${provider.deliveryTime || '-'}</p></div></div>${providerDocumentChecklist(provider.documentation)}<div class="mt-5 flex flex-wrap justify-end gap-2"><button onclick="reviewProvider('${provider.id}','OBSERVADO')" class="rounded border border-amber-400 px-3 py-2 text-sm text-amber-700">Observar</button><button onclick="reviewProvider('${provider.id}','RECHAZADO')" class="rounded border border-red-400 px-3 py-2 text-sm text-red-700">Rechazar</button><button onclick="reviewProvider('${provider.id}','EN REVISIÓN')" class="rounded bg-primary px-3 py-2 text-sm text-white">Aprobar</button></div></article>`; }).join('') : '<div class="lg:col-span-2 bg-white rounded-lg border border-dashed py-14 text-center text-sm text-gray-500">No tienes proveedores pendientes de evaluación.</div>'}</div></div>`;
}

function renderProviderRequests() {
    if (currentUser?.role !== ROLES.ANDF_ADF && currentUser?.role !== ROLES.SUPER_ADMIN) return '<p class="text-sm text-gray-500">No tienes acceso a esta sección.</p>';
    const ownRequests = db.requests.filter(request => (currentUser.isSig || request.requesterId === currentUser.id) && (db.providerRegistrations.some(provider => provider.requestId === request.id) || db.supplierSearches.some(search => search.requestId === request.id))).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return `<div class="max-w-6xl mx-auto"><div class="mb-6"><h1 class="text-2xl font-bold">Requerimientos</h1><p class="text-sm text-gray-500">Consulta tus requerimientos y los proveedores enviados por Logística.</p></div><div class="space-y-5">${ownRequests.length ? ownRequests.map(request => {
        const search = getSupplierSearch(request.id);
        const providers = db.providerRegistrations.filter(provider => provider.requestId === request.id);
        return `<section class="rounded-lg border bg-white shadow-sm overflow-hidden"><div class="flex flex-col gap-4 border-b bg-gray-50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"><div><div class="flex flex-wrap items-center gap-2"><h2 class="font-semibold text-lg">${request.reqNumber}</h2>${getSupplierSearchBadge(search.status)}</div><p class="mt-1 text-sm font-medium text-gray-800">${request.productName || '(Sin producto)'}</p><p class="mt-1 text-sm text-gray-500">${request.requirementDescription || request.description || 'Sin descripción registrada.'}</p></div><div class="flex flex-wrap gap-2"><button onclick="navigateTo('detail','${request.id}')" class="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white"><i class="fas fa-file-alt mr-1"></i> Ver requerimiento</button>${search.status === 'CERRADO' ? `<button onclick="reopenSupplierSearch('${request.id}', 'df')" class="rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"><i class="fas fa-rotate-right mr-1"></i> Reabrir selección de proveedores</button>` : ''}</div></div><div class="p-5"><h3 class="mb-3 text-sm font-semibold text-gray-700">Proveedores enviados por Logística</h3>${providers.length ? `<div class="grid grid-cols-1 gap-3 md:grid-cols-2">${providers.map(provider => `<div class="rounded-md border border-gray-200 p-4"><div class="flex items-start justify-between gap-2"><div><p class="font-medium text-gray-800">${provider.supplierName}</p><p class="text-xs text-gray-500">${provider.manufacturer || 'Fabricante no registrado'} · ${provider.origin || 'Origen no registrado'}</p><p class="mt-1 text-xs text-gray-400">Añadido el ${formatDateTime(provider.createdAt)}</p></div>${getProviderStatusBadge(provider.status)}</div><p class="mt-3 text-xs text-gray-500">MOQ / costo: ${(provider.moqs || []).map(item => `${item.quantity || '-'} ${provider.currency || ''} ${item.cost ? `· ${item.cost}` : ''}`).join(' · ') || '-'}</p></div>`).join('')}</div>` : '<p class="text-sm text-gray-500">Logística aún no ha enviado proveedores para este requerimiento.</p>'}</div></section>`;
    }).join('') : '<div class="rounded-lg border border-dashed bg-white py-14 text-center text-sm text-gray-500">Aún no tienes requerimientos con proveedores registrados.</div>'}</div></div>`;
}

function reviewProvider(providerId, status) {
    const labels = { OBSERVADO: 'Observar proveedor', RECHAZADO: 'Rechazar proveedor', 'EN REVISIÓN': 'Aprobar proveedor' };
    const needsComment = status !== 'EN REVISIÓN';
    openModal(labels[status], `<label class="block text-sm font-medium mb-1">${needsComment ? 'Comentario *' : 'Comentario (opcional)'}</label><textarea id="provider-review-comment" class="w-full border rounded p-2" rows="3" placeholder="${needsComment ? 'Indica el motivo' : 'Comentario de aprobación'}"></textarea>`, async () => {
        const comment = document.getElementById('provider-review-comment').value.trim();
        if (needsComment && !comment) throw new Error('El comentario es obligatorio.');
        await updateProviderStatus(providerId, status, status === 'EN REVISIÓN' ? 'aprobar' : status === 'OBSERVADO' ? 'observar' : 'rechazar', comment);
        showToast(status === 'EN REVISIÓN' ? 'Proveedor aprobado y enviado a la siguiente revisión.' : `Proveedor ${status.toLowerCase()}.`);
        navigateTo('provider-review');
    }, labels[status]);
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
        if (canEditOwnDraft(existing)) {
            reqData = existing; isEdit = true;
        } else {
            showToast('No tienes permiso para editar esta solicitud.', 'error');
            setTimeout(() => navigateTo('dashboard'), 1500); return '';
        }
    }

    const val = (key) => reqData[key] || '';
    const isObserved = reqData.status === STATUS.OBSERVADO;
    const isNewProduct = Boolean(reqData.productNew);
    const selectedProduct = isNewProduct ? null : findCatalogItem(val('productName'));
    const autoLocked = selectedProduct ? 'disabled' : '';

    const opts = (arr, key) => arr.map(x => typeof x === 'string' ? `<option value="${x}" ${val(key)===x?'selected':''}>${x}</option>` : `<option value="${x.id}" ${val(key)===x.id?'selected':''}>${x.label} (${x.desc})</option>`).join('');

    return `
        <div class="max-w-4xl mx-auto pb-20">
            <div class="flex items-center gap-3 mb-6"><button onclick="navigateTo('dashboard')" class="bg-white p-2 rounded-full shadow-sm border"><i class="fas fa-arrow-left"></i></button><div><h1 class="text-2xl font-bold">${isEdit ? 'Editar Requerimiento' : 'Crear Requerimiento'}</h1><p class="text-sm text-gray-500">FICHA 1 - DF</p></div></div>
            ${isObserved ? `<div class="bg-red-50 border-l-4 border-red-500 p-4 mb-6"><h3 class="font-medium text-red-800">Observada</h3><p class="italic text-sm mt-1">"${getLastObservation(reqData.id)}"</p></div>` : ''}
            <div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-5 py-4 flex items-center justify-between"><div><p class="text-xs font-semibold uppercase tracking-wide text-blue-700">Código actual</p><p class="mt-1 text-xl font-bold text-blue-900">${val('reqNumber') || getNextRequestCode()}</p></div><span class="text-xs text-blue-700">Se generará como borrador</span></div>
            
            <form id="req-form" onsubmit="handleFormSubmit(event)" class="space-y-6 flex flex-col">
                <input type="hidden" id="req-id" value="${val('id')}">
                <input type="hidden" id="req-status" value="${isEdit ? reqData.status : STATUS.BORRADOR}">
                
                <div class="order-2 bg-white rounded-lg shadow-sm border"><div class="bg-gray-50 px-6 py-4 border-b"><h3 class="font-semibold">Información del Producto</h3></div>
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2"><div class="flex items-center justify-between gap-3"><label class="block text-sm font-medium">${isNewProduct ? 'Nombre del producto nuevo' : 'Nombre o código del producto'} *</label><label class="inline-flex items-center gap-2 text-sm font-medium text-primary cursor-pointer"><input type="checkbox" id="productNew" onchange="toggleProductMode()" ${isNewProduct ? 'checked' : ''} class="h-4 w-4"> Producto nuevo</label></div><input type="text" id="productName" ${isNewProduct ? '' : 'list="product-suggestions" oninput="handleProductLookup()"'} required value="${val('productName')}" placeholder="${isNewProduct ? 'Ingrese el nombre del producto nuevo' : 'Escriba código o nombre'}" class="mt-1 block w-full border-gray-300 rounded border p-2"><datalist id="product-suggestions">${db.catalogItems.map(item => `<option value="${item.code} - ${item.name}"></option>`).join('')}</datalist><p id="product-help" class="mt-1 text-xs text-gray-500">${isNewProduct ? 'Registre manualmente la información del producto nuevo.' : 'Seleccione una coincidencia para completar los datos automáticamente.'}</p></div>
                    <div><label class="block text-sm font-medium">Categoría *</label><select id="category" required ${autoLocked} class="mt-1 block w-full border-gray-300 rounded border p-2 ${selectedProduct ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''}"><option value="">Seleccione...</option>${opts(LISTS.categories, 'category')}</select></div>
                    <div><label class="block text-sm font-medium">Forma farmacéutica</label><select id="pharmaceuticalForm" ${autoLocked} class="mt-1 block w-full border-gray-300 rounded border p-2 ${selectedProduct ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''}"><option value="">Seleccione...</option>${opts(LISTS.pharmaForms, 'pharmaceuticalForm')}</select></div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Responsable *</label><input type="text" id="responsible" required value="${val('responsible') || currentUser.name}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                </div></div>

                <div class="order-1 bg-white rounded-lg shadow-sm border"><div class="bg-gray-50 px-6 py-4 border-b"><h3 class="font-semibold">Información del Requerimiento</h3></div>
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label class="block text-sm font-medium">Cantidad de muestra *</label><input type="number" id="sampleQuantity" min="0.01" step="0.01" required value="${val('sampleQuantity')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                    <div><label class="block text-sm font-medium">Unidad de medida *</label><select id="unit" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option>${opts(LISTS.units, 'unit')}</select></div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Prioridad *</label><select id="priority" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option>${opts(LISTS.priorities, 'priority')}</select></div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Tipo de artículo *</label><select id="articleType" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option>${opts(LISTS.articleTypes, 'articleType')}</select></div>
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Descripción *</label><textarea id="description" required class="mt-1 block w-full border-gray-300 rounded border p-2">${val('description')}</textarea></div>
                </div></div>

                <div class="order-3 bg-white rounded-lg shadow-sm border"><div class="bg-gray-50 px-6 py-4 border-b"><h3 class="font-semibold">Información complementaria</h3></div>
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2"><label class="block text-sm font-medium">Uso destinado *</label><textarea id="intendedUse" required class="mt-1 block w-full border-gray-300 rounded border p-2">${val('intendedUse')}</textarea></div>
                    <div><label class="block text-sm font-medium">Tamaño de partícula</label><input type="text" id="particleSize" value="${val('particleSize')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                    <div><label class="block text-sm font-medium">Working estándar *</label><select id="workingStandard" required class="mt-1 block w-full border-gray-300 rounded border p-2"><option value="">Seleccione...</option><option value="SI" ${val('workingStandard')==='SI'?'selected':''}>SI</option><option value="NO" ${val('workingStandard')==='NO'?'selected':''}>NO</option></select></div>
                    <div><label class="block text-sm font-medium">N° CAS</label><input type="text" id="casNumber" value="${val('casNumber')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                    <div><label class="block text-sm font-medium">Cantidad requerida para Lotes Industriales</label><input type="number" id="industrialLotQuantity" step="0.01" value="${val('industrialLotQuantity')}" class="mt-1 block w-full border-gray-300 rounded border p-2"></div>
                </div></div>

                <div class="order-4 bg-white rounded-lg shadow-sm border"><div class="bg-gray-50 px-6 py-4 border-b"><h3 class="font-semibold">Observaciones</h3></div>
                <div class="p-6"><textarea id="observations" class="mt-1 block w-full border-gray-300 rounded border p-2">${val('observations')}</textarea></div></div>

                <div class="fixed bottom-0 left-0 md:left-64 right-0 bg-white border-t p-4 flex justify-end gap-4 shadow-lg z-20">
                    <span id="autosave-state" class="mr-auto self-center text-xs text-gray-500">Los cambios se guardan automáticamente</span>
                    ${isEdit && reqData.status === STATUS.BORRADOR ? `<button type="button" onclick="cancelDraft('${reqData.id}')" class="bg-red-50 border border-red-200 text-red-700 px-6 py-2 rounded-md shadow-sm font-medium">Eliminar borrador</button>` : ''}
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

    if (canEditOwnDraft(req)) {
        actionsHtml = actBox(`<button onclick="navigateTo('form', '${req.id}')" class="bg-blue-600 text-white px-4 py-2 rounded">Editar / Subsanar</button>`);
    } else if (currentUser.role === ROLES.SGID_CDF && req.status === STATUS.EN_REVISION) {
        actionsHtml = actBox(`
            <button onclick="handleAction('${req.id}', 'cancelar')" class="bg-gray-100 px-4 py-2 rounded border">Cancelar</button>
            <button onclick="handleAction('${req.id}', 'observar')" class="bg-red-600 text-white px-4 py-2 rounded">Observar</button>
            <button type="button" onclick="handleAction('${req.id}', 'aprobar_sgid')" class="bg-green-600 text-white px-4 py-2 rounded">Aprobar</button>
        `);
    } else if (currentUser.role === ROLES.LOG && req.status === STATUS.APROBACION_PENDIENTE_LOG) {
        actionsHtml = actBox(`
            <button onclick="handleAction('${req.id}', 'observar')" class="bg-red-600 text-white px-4 py-2 rounded">Observar</button>
            <button onclick="handleAction('${req.id}', 'aprobar_log')" class="bg-green-600 text-white px-4 py-2 rounded">Aprobar</button>
        `);
    }

    const hist = db.history.filter(h => h.requestId === req.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const historyHtml = hist.map(h => `
        <li class="relative pb-5">
            <div class="relative flex space-x-3">
                <div class="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                    <div><p class="text-sm text-gray-500"><span class="font-medium text-gray-900">${personWithArea(h.userName, h.userRole)}</span> ${h.action === 'crear' ? 'creó el requerimiento' : h.action === 'aprobar' ? 'aprobó el requerimiento' : h.action === 'cancelar' ? 'canceló el requerimiento' : 'registró la acción'}: ${getStatusBadge(h.newStatus)}</p>
                    ${h.comment ? `<p class="mt-1 text-sm bg-gray-50 p-2 rounded border">"${h.comment}"</p>` : ''}</div>
                    <div class="text-right text-xs text-gray-500">${formatDateTime(h.timestamp)}</div>
                </div>
            </div>
            ${h.action === 'observar' && req.observationAttachments?.length ? `<div class="mt-2 flex flex-wrap gap-2">${req.observationAttachments.map(file => `<a download="${file.name}" href="${file.dataUrl}" class="text-xs text-primary border rounded px-2 py-1"><i class="fas fa-paperclip mr-1"></i>${file.name}</a>`).join('')}</div>` : ''}
        </li>`).join('');

    const Field = (lbl, val) => `<div><dt class="text-xs font-medium text-gray-500 uppercase">${lbl}</dt><dd class="mt-1 text-sm font-medium">${val || '-'}</dd></div>`;
    const tabClass = (tab) => detailTab === tab ? 'border-primary text-primary bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300';
    // Todas las solicitudes requieren la aprobación final de Logística.
    const needsLogApproval = true;
    const sgidApproved = hist.some(h => h.userRole === ROLES.SGID_CDF && h.action === 'aprobar');
    const logApproved = hist.some(h => h.userRole === ROLES.LOG && h.action === 'aprobar' && h.newStatus === STATUS.APROBADO);
    const reviewSteps = [
        { role: ROLES.ANDF_ADF, label: 'Crear solicitud', done: hist.some(h => h.action === 'crear') },
        { role: ROLES.SGID_CDF, label: 'Aprobar solicitud', done: sgidApproved },
        ...(needsLogApproval ? [{ role: ROLES.LOG, label: 'Aprobar solicitud', done: logApproved }] : []),
        { role: null, label: 'Fin', done: req.status === STATUS.APROBADO }
    ];
    const workflowSteps = [
        { label: 'Enviado', done: hist.some(h => h.newStatus === STATUS.EN_REVISION) },
        { label: 'Aprobación SGID', done: sgidApproved },
        ...(needsLogApproval ? [{ label: 'Aprobación LOG', done: logApproved }] : []),
        { label: 'Cerrado', done: [STATUS.APROBADO, STATUS.CANCELADO].includes(req.status) }
    ];
    const workflowProgressHtml = `<div class="mt-7 overflow-x-auto pb-2"><div class="min-w-[620px] flex items-start">${workflowSteps.map((step, index) => `<div class="contents"><div class="w-28 shrink-0 text-center"><span class="mx-auto flex h-8 w-8 items-center justify-center rounded-full ${step.done ? 'bg-primary text-white' : 'border-2 border-gray-300 bg-white text-transparent'}">${step.done ? '<i class="fas fa-check text-sm"></i>' : ''}</span><p class="mt-3 text-sm font-medium ${step.done ? 'text-gray-900' : 'text-gray-500'}">${step.label}</p></div>${index < workflowSteps.length - 1 ? `<div class="mt-4 h-0.5 flex-1 ${step.done && workflowSteps[index + 1].done ? 'bg-primary' : 'bg-gray-300'}"></div>` : ''}</div>`).join('')}</div></div>`;
    const timelineHtml = hist.map((h, index) => `
        <li class="relative pl-8 ${index < hist.length - 1 ? 'pb-8' : ''}">
            <span class="absolute left-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white"><i class="fas ${h.action === 'aprobar' ? 'fa-check' : h.action === 'cancelar' ? 'fa-ban' : 'fa-circle'} text-[8px]"></i></span>
            <p class="text-sm font-semibold text-gray-900">${h.action === 'crear' ? 'Creación del requerimiento' : h.action === 'enviar_revision' ? 'Enviado a revisión' : h.action === 'aprobar' ? 'Requerimiento aprobado' : h.action === 'cancelar' ? 'Requerimiento cancelado' : h.action === 'observar' ? 'Requerimiento observado' : 'Estado actualizado'}</p>
            <p class="text-sm text-gray-600">${personWithArea(h.userName, h.userRole)} · ${formatDateTime(h.timestamp)}</p>
        </li>`).join('') + reviewSteps.filter(step => !step.done).map((step, index) => `
        <li class="relative pl-8 ${index < reviewSteps.length - 1 ? 'pb-8' : ''}">
          <span class="absolute left-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500"><i class="fas fa-clock text-[8px]"></i></span>
          <p class="text-sm font-semibold text-gray-700">${step.label}</p>
          <p class="text-sm text-gray-500">Pendiente: ${step.role ? areaForRole(step.role) : 'Cierre del flujo'}</p>
        </li>`).join('');

    return `
        <div class="max-w-5xl mx-auto pb-10">
            <div class="mb-6 flex justify-between items-start">
                <div class="flex items-center gap-3"><button onclick="navigateTo('dashboard')" class="bg-white p-2 rounded-full border"><i class="fas fa-arrow-left"></i></button>
                <div><h1 class="text-2xl font-bold flex items-center gap-3">${req.reqNumber || ''} ${getStatusBadge(req.status)}</h1><p class="mt-1 text-sm text-gray-500">${formatDateTime(req.createdAt || req.date)}</p></div></div>
            </div>
            
            <div class="mb-6 border-b border-gray-200 flex gap-1 overflow-x-auto">
                <button onclick="setDetailTab('detail')" class="px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tabClass('detail')}"><i class="fas fa-file-alt mr-2"></i>Detalle del requerimiento</button>
                <button onclick="setDetailTab('history')" class="px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tabClass('history')}"><i class="fas fa-history mr-2"></i>Bitácora</button>
                <button onclick="setDetailTab('flow')" class="px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tabClass('flow')}"><i class="fas fa-route mr-2"></i>Flujo de revisión</button>
            </div>

            <div class="${detailTab === 'detail' ? '' : 'hidden'} bg-white shadow rounded-xl border overflow-hidden">
                <div class="px-6 py-5 bg-gradient-to-r from-slate-50 to-blue-50 border-b"><h3 class="text-lg font-semibold">Detalle del requerimiento</h3><p class="text-sm text-gray-500">Información registrada en la solicitud</p></div>
                <div class="p-6">
                    <h4 class="text-sm font-semibold text-primary uppercase tracking-wide mb-4">Información del requerimiento</h4><dl class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 border-b pb-6">${Field('Cantidad de muestra', `${req.sampleQuantity || '-'} ${req.unit || ''}`)} ${Field('Prioridad', req.priority)} ${Field('Tipo de artículo', req.articleType)} <div class="md:col-span-3">${Field('Descripción', req.description)}</div></dl>
                    <h4 class="text-sm font-semibold text-primary uppercase tracking-wide mb-4">Información del producto</h4><dl class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 border-b pb-6">${Field('Producto', req.productName)} ${Field('Categoría', req.category)} ${Field('Forma farmacéutica', req.pharmaceuticalForm)} ${Field('Responsable', req.responsible)}</dl>
                    <h4 class="text-sm font-semibold text-primary uppercase tracking-wide mb-4">Información complementaria</h4><dl class="grid grid-cols-1 md:grid-cols-3 gap-6">${Field('Tamaño de partícula', req.particleSize)} ${Field('Working estándar', req.workingStandard)} ${Field('N° CAS', req.casNumber)} ${Field('Cantidad requerida para Lotes Industriales', req.industrialLotQuantity)} <div class="md:col-span-3">${Field('Uso destinado', req.intendedUse)}</div><div class="md:col-span-3">${Field('Observaciones', req.observations)}</div></dl>
                </div>
            </div>
            ${detailTab === 'detail' ? actionsHtml : ''}
            <div class="${detailTab === 'history' ? '' : 'hidden'} mt-8 bg-white shadow rounded-lg border">
                <div class="px-4 py-5 bg-gray-50 border-b"><h3 class="text-lg font-medium">Bitácora del requerimiento</h3></div>
                <div class="p-6"><ul class="ml-3 border-l-2 border-blue-200 pl-5">${historyHtml}</ul></div>
            </div>
            <div class="${detailTab === 'flow' ? '' : 'hidden'} bg-white shadow rounded-lg border p-6">
                <h3 class="text-xl font-bold text-gray-900">Flujo de revisión</h3>
                <p class="mt-1 text-sm text-gray-500">Revisa el flujo de revisión del requerimiento.</p>
                ${workflowProgressHtml}
                <ol class="mt-8 ml-2 border-l-2 border-blue-200">${timelineHtml}</ol>
            </div>
        </div>
    `;
}

// --- 6. ACTION HANDLERS ---
let formSubmitIntent = null;
function getFormData(status) {
    return {
        id: document.getElementById('req-id').value || null,
        articleType: document.getElementById('articleType').value,
        description: document.getElementById('description').value,
        sampleQuantity: document.getElementById('sampleQuantity').value,
        unit: document.getElementById('unit').value,
        priority: document.getElementById('priority').value,
        productNew: document.getElementById('productNew').checked,
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
        status
    };
}

function renderSigRoleChooser() {
    const roleButton = (role, icon, title, detail, color) => `<button onclick="selectSigRole('${role}')" class="w-full text-left rounded-lg border p-4 hover:shadow-md transition bg-white hover:border-blue-400"><div class="flex items-center gap-4"><span class="w-10 h-10 rounded-full ${color} text-white flex items-center justify-center"><i class="fas ${icon}"></i></span><div><p class="font-semibold text-gray-900">${title}</p><p class="text-sm text-gray-500">${detail}</p></div></div></button>`;
    return `<div class="min-h-screen flex items-center justify-center w-full bg-gray-50 p-4"><div class="max-w-lg w-full space-y-6 bg-white p-8 rounded-xl shadow-lg border border-gray-100"><div class="text-center"><img src="assets/biomont-logo.png" alt="Biomont" class="mx-auto h-16 w-48 object-contain"/><h1 class="mt-5 text-2xl font-bold text-gray-900">Selecciona un perfil</h1><p class="mt-2 text-sm text-gray-600">SIG puede operar BIOREQ con uno de los perfiles habilitados.</p></div><div class="space-y-3">${roleButton('ANDF_ADF', 'fa-flask', 'Desarrollo Farmacéutico', 'Crear y subsanar requerimientos.', 'bg-blue-600')}${roleButton('SGID_CDF', 'fa-microscope', 'Investigación y Desarrollo', 'Revisar, aprobar, observar o cancelar.', 'bg-purple-600')}${roleButton('LOG', 'fa-truck', 'Logística', 'Revisar y aprobar solicitudes derivadas.', 'bg-emerald-600')}</div>${currentUser?.activeRole ? `<button onclick="cancelSigRoleChooser()" class="w-full text-sm text-gray-500 hover:text-gray-800">Volver al perfil actual</button>` : `<button onclick="logout()" class="w-full text-sm text-gray-500 hover:text-gray-800">Cerrar sesión</button>`}</div></div>`;
}

function toggleProductMode() {
    const isNewProduct = document.getElementById('productNew').checked;
    const input = document.getElementById('productName');
    const help = document.getElementById('product-help');
    const label = input.closest('.md\\:col-span-2').querySelector('label');

    if (isNewProduct) {
        input.removeAttribute('list');
        input.oninput = null;
        input.placeholder = 'Ingrese el nombre del producto nuevo';
        if (help) help.textContent = 'Registre manualmente la información del producto nuevo.';
        if (label) label.textContent = 'Nombre del producto nuevo *';
        // Un producto nuevo no tiene datos que heredar del catálogo.
        document.getElementById('category').value = '';
        document.getElementById('pharmaceuticalForm').value = '';
        setProductFieldsLocked(false);
    } else {
        input.setAttribute('list', 'product-suggestions');
        input.oninput = handleProductLookup;
        input.placeholder = 'Escriba código o nombre';
        if (help) help.textContent = 'Seleccione una coincidencia para completar los datos automáticamente.';
        if (label) label.textContent = 'Nombre o código del producto *';
        handleProductLookup();
    }
    queueFormAutosave();
}

function findCatalogItem(value) {
    const normalized = (value || '').trim().toLowerCase();
    return db.catalogItems.find(candidate => `${candidate.code} - ${candidate.name}`.toLowerCase() === normalized || candidate.code.toLowerCase() === normalized);
}

function setProductFieldsLocked(locked) {
    ['category', 'pharmaceuticalForm'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.disabled = locked;
        field.classList.toggle('bg-gray-100', locked);
        field.classList.toggle('text-gray-600', locked);
        field.classList.toggle('cursor-not-allowed', locked);
    });
}

function handleProductLookup() {
    if (document.getElementById('productNew')?.checked) return;
    const input = document.getElementById('productName');
    const item = findCatalogItem(input.value);
    if (!item) {
        setProductFieldsLocked(false);
        return;
    }
    input.value = `${item.code} - ${item.name}`;
    const fill = (id, value) => {
        const field = document.getElementById(id);
        if (!field || !value) return;
        if (field.tagName === 'SELECT' && ![...field.options].some(option => option.value === value)) field.add(new Option(value, value));
        field.value = value;
    };
    fill('category', item.category);
    fill('pharmaceuticalForm', item.pharmaceutical_form);
    setProductFieldsLocked(true);
    queueFormAutosave();
}

function setupFormAutosave() {
    const form = document.getElementById('req-form');
    if (!form) return;
    form.addEventListener('input', queueFormAutosave);
    form.addEventListener('change', queueFormAutosave);
}

function queueFormAutosave() {
    clearTimeout(autosaveTimer);
    autosaveDirty = true;
    const state = document.getElementById('autosave-state');
    if (state) state.textContent = 'Guardando cambios…';
    autosaveTimer = setTimeout(saveFormAutomatically, 650);
}

async function saveFormAutomatically() {
    if (!currentUser || currentView !== 'form' || formSubmissionInProgress) return;
    if (autosaveInProgress) {
        autosaveTimer = setTimeout(saveFormAutomatically, 300);
        return;
    }
    autosaveInProgress = true;
    autosaveDirty = false;
    const state = document.getElementById('autosave-state');
    try {
        const status = document.getElementById('req-status').value || STATUS.BORRADOR;
        const saved = await saveRequest(getFormData(status), 'guardar');
        document.getElementById('req-id').value = saved.id;
        document.getElementById('req-status').value = saved.status;
        if (state) state.textContent = `Guardado en Supabase · ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        if (state) state.textContent = 'No se pudo guardar. Se reintentará al modificar el formulario.';
    } finally {
        autosaveInProgress = false;
        if (autosaveDirty) autosaveTimer = setTimeout(saveFormAutomatically, 300);
    }
}

function submitForm(intent) {
    formSubmitIntent = intent;
    const form = document.getElementById('req-form');
    if (form.checkValidity()) {
        if (intent === 'send') openModal('Enviar a aprobación', '<p>¿Está seguro de enviar este requerimiento?</p>', executeFormSave);
        else executeFormSave();
    } else form.reportValidity();
}

function cancelDraft(reqId) {
    const request = db.requests.find(item => item.id === reqId);
    if (!request || request.status !== STATUS.BORRADOR) {
        showToast('Solo se puede cancelar un requerimiento en etapa de borrador.', 'error');
        return;
    }
    openModal('Eliminar borrador', '<p>¿Seguro que deseas eliminar este borrador?</p><p class="mt-2 text-sm text-gray-600">No podrás continuar con su registro. Se conservará como cancelado en el historial para mantener la trazabilidad.</p>', () => changeStatus(reqId, STATUS.CANCELADO, 'cancelar', 'Borrador eliminado por el solicitante.'), 'Sí, eliminar borrador', true);
}

function handleFormSubmit(e) { e.preventDefault(); submitForm(formSubmitIntent || 'draft'); }

async function executeFormSave() {
    clearTimeout(autosaveTimer);
    autosaveDirty = false;
    formSubmissionInProgress = true;
    const status = formSubmitIntent === 'send' ? STATUS.EN_REVISION : STATUS.BORRADOR;
    const data = getFormData(status);
    data._comment = formSubmitIntent === 'send' ? 'Enviado a revisión SGID/CDF' : 'Guardado como borrador';

    try {
        const action = formSubmitIntent === 'send' ? 'enviar_revision' : (data.id ? 'guardar' : 'crear');
        const saved = await saveRequest(data, action);
        if (saved) { showToast('Acción exitosa'); navigateTo('dashboard'); }
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        formSubmissionInProgress = false;
    }
}

async function handleAction(reqId, actionStr) {
    const req = db.requests.find(request => request.id === reqId);
    if (!req) {
        showToast('No se encontró el requerimiento.', 'error');
        return;
    }

    if (actionStr === 'aprobar_sgid') {
        const confirmation = '¿Confirmas la aprobación SGID? El requerimiento se enviará a Logística para su aprobación final.';
        if (!window.confirm(confirmation)) return;

        try {
            await changeStatus(
                reqId,
                STATUS.APROBACION_PENDIENTE_LOG,
                'aprobar',
                'Aprobado SGID. Enviado a Logística para aprobación final.'
            );
        } catch (error) {
            showToast(error.message || 'No se pudo aprobar el requerimiento.', 'error');
        }
    }
    else if (actionStr === 'aprobar_log') openModal('Aprobar (LOG)', '<p>Aprobación final.</p>', () => changeStatus(reqId, STATUS.APROBADO, 'aprobar', 'Aprobado LOG'));
    else if (actionStr === 'cancelar') {
        openModal('Cancelar requerimiento', '<p class="mb-3">El requerimiento se marcará como cancelado y quedará registrado en la bitácora.</p><textarea id="cancel-comment" placeholder="Motivo de cancelación (obligatorio)" class="w-full border rounded p-2"></textarea>', () => {
            const comment = document.getElementById('cancel-comment').value.trim();
            if (comment) changeStatus(reqId, STATUS.CANCELADO, 'cancelar', comment);
            else showToast('El motivo de cancelación es obligatorio', 'error');
        }, 'Cancelar requerimiento', true);
    }
    else if (actionStr === 'observar') {
        openModal('Observar', '<label class="block text-sm font-medium mb-1">Observación *</label><textarea id="obs-comment" class="w-full border rounded p-2 mb-4"></textarea><label class="block text-sm font-medium mb-1">Imágenes o documentos de sustento</label><input id="obs-files" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" class="w-full text-sm"><p class="mt-1 text-xs text-gray-500">Máximo 2 MB por archivo.</p>', async () => {
            const c = document.getElementById('obs-comment').value;
            if (!c) return showToast('Comentario obligatorio', 'error');
            try { await changeStatus(reqId, STATUS.OBSERVADO, 'observar', c, await readObservationFiles()); }
            catch (error) { showToast(error.message, 'error'); }
        }, 'Registrar', true);
    }
}

async function readObservationFiles() {
    const files = [...(document.getElementById('obs-files')?.files || [])];
    return Promise.all(files.map(file => new Promise((resolve, reject) => {
        if (file.size > 2 * 1024 * 1024) return reject(new Error(`${file.name} supera 2 MB.`));
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
        reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
        reader.readAsDataURL(file);
    })));
}

async function changeStatus(reqId, newStatus, action, comment, attachments = []) {
    const req = db.requests.find(r => r.id === reqId);
    if (!req) throw new Error('No se encontró el requerimiento a actualizar.');
    const saved = await saveRequest({ ...req, status: newStatus, _comment: comment, observationAttachments: attachments }, action);
    showToast(`Estado: ${newStatus}`);
    // Mantenemos abierto el requerimiento para que el aprobador vea el
    // cambio de estado y la bitácora inmediatamente.
    navigateTo('detail', saved.id);
}

// --- 7. AUTH & HELPERS ---
function loginWithMicrosoft() { window.location.assign('/api/auth?action=microsoft'); }

function openSigRoleChooser() { sigRoleChooserOpen = true; renderApp(); }
function cancelSigRoleChooser() { sigRoleChooserOpen = false; renderApp(); }
async function selectSigRole(role) {
    beginLoading('Cambiando perfil…');
    try {
        const response = await fetch('/api/auth?action=select-role', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo seleccionar el perfil.');
        currentUser = result.user;
        sigRoleChooserOpen = false;
        await loadDatabase();
        currentView = 'dashboard';
        renderApp();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        endLoading();
    }
}

async function restoreSession() {
    beginLoading('Iniciando sesión…');
    try {
        const response = await fetch('/api/auth?action=session');
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Sin sesión.');
        currentUser = result.user;
        await loadDatabase();
        currentView = 'dashboard';
        renderApp();
    } catch (error) {
        currentUser = null;
        renderApp();
        const reason = new URLSearchParams(window.location.search).get('auth_error');
        if (reason) {
            const errorBox = document.getElementById('login-error');
            errorBox.textContent = reason === 'not_authorized' ? 'Tu cuenta Microsoft no está autorizada para acceder a BIOREQ.' : 'No se pudo completar el inicio de sesión con Microsoft.';
            errorBox.classList.remove('hidden');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } finally {
        endLoading();
    }
}
async function logout() {
    await withLoading(() => fetch('/api/auth?action=logout', { method: 'POST' }), 'Cerrando sesión…');
    currentUser = null;
    currentView = 'dashboard';
    renderApp();
}
function getLastObservation(reqId) { const obs = db.history.filter(h => h.requestId === reqId && h.newStatus === STATUS.OBSERVADO).reverse(); return obs.length ? obs[0].comment : ''; }

window.onload = restoreSession;
