// --- 1. MOCK DATABASE & CONSTANTS ---
const ROLES = {
    ANDF_ADF: 'ANDF_ADF',
    SGID_CDF: 'SGID_CDF',
    LOG: 'LOG'
};

const STATUS = {
    BORRADOR: 'BORRADOR',
    EN_REVISION: 'EN REVISIÓN',
    OBSERVADO: 'OBSERVADO',
    APROBACION_PENDIENTE_LOG: 'APROBACIÓN PENDIENTE – LOG',
    APROBADO: 'APROBADO',
    CANCELADO: 'CANCELADO'
};

const LISTS = {
    articleTypes: ['Materia Prima', 'Material de envase', 'Material de empaque', 'Producto terminado', 'Otros'],
    units: ['kg', 'g', 'L', 'unidad'],
    priorities: [
        { id: 'A', label: 'A', desc: '1 - 2 meses', color: 'text-red-700 bg-red-100 ring-red-600/20' },
        { id: 'B', label: 'B', desc: '2.1 - 3 meses', color: 'text-yellow-800 bg-yellow-100 ring-yellow-600/20' },
        { id: 'C', label: 'C', desc: '3.1 - 5 meses', color: 'text-green-700 bg-green-100 ring-green-600/20' }
    ],
    categories: ['Farmacológico', 'Alimento', 'Otro'],
    pharmaForms: ['Tableta', 'Cápsula', 'Jarabe', 'Inyectable', 'Crema', 'Otro']
};

const INITIAL_USERS = [
    { id: 'u1', username: 'andf01', password: '123', role: ROLES.ANDF_ADF, name: 'Juan Pérez (ANDF/ADF)' },
    { id: 'u2', username: 'sgid01', password: '123', role: ROLES.SGID_CDF, name: 'María Gómez (SGID/CDF)' },
    { id: 'u3', username: 'log01', password: '123', role: ROLES.LOG, name: 'Carlos Ruiz (LOG)' }
];

// La información operativa se consulta y guarda exclusivamente en Supabase mediante /api/bioreq.
let db = { users: INITIAL_USERS, requests: [], history: [] };

// Current App State
let currentUser = null;
let currentView = 'dashboard';
let viewContextId = null;
let currentFilters = { num: '', prod: '', status: '', priority: '', type: '' };
let detailTab = 'detail';
