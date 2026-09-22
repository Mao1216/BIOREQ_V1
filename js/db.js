// --- 1. MOCK DATABASE & CONSTANTS ---
const ROLES = {
    ANDF_ADF: 'ANDF_ADF',
    SGID_CDF: 'SGID_CDF',
    LOG: 'LOG',
    SUPER_ADMIN: 'SUPER_ADMIN'
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

// La información operativa y las cuentas se consultan y guardan exclusivamente
// en Supabase mediante /api/bioreq. No se utiliza almacenamiento del navegador.
let db = { requests: [], history: [], catalogItems: [] };

// Current App State
let currentUser = null;
let currentSessionToken = null;
let currentView = 'dashboard';
let viewContextId = null;
let currentFilters = { num: '', prod: '', status: '', priority: '', type: '' };
let detailTab = 'detail';
