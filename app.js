// Configuración de Supabase
const SUPABASE_URL = "https://evktqhhiqxsnybynbtds.supabase.co";
const SUPABASE_KEY = "sb_publishable_jWiY7-nyFZneZYpBPNrDDg_XO3u3MbY";

// Inicializar Supabase
let supabaseClient;

try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true
        }
    });
    console.log("Supabase inicializado correctamente");
} catch (error) {
    console.error("Error inicializando Supabase:", error);
    showMessage("login-message", "Error cargando Supabase. Por favor recarga la página.", "error");
}

// Restaurar sesión persistente para que no se cierre al recargar
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session && session.user) {
            const isOp = await checkOperator(session.user.email);
            if (isOp) {
                userEmail.textContent = session.user.email;
                loginScreen.classList.add('hidden');
                dashboardScreen.classList.remove('hidden');
                await loadUsers();
                // Actualizar automáticamente cada 5 segundos para ver estado en vivo
                setInterval(loadUsers, 5000);
            }
        }
    } catch (e) {
        console.error("Error restaurando sesión:", e);
    }
});

// Elementos del DOM
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');
const createUserBtn = document.getElementById('create-user-btn');
const searchInput = document.getElementById('search-input');
const usersTableBody = document.getElementById('users-table-body');
const userModal = document.getElementById('user-modal');
const userModalForm = document.getElementById('user-modal-form');
const cancelUserModal = document.getElementById('cancel-user-modal');

let users = [];
let currentFilter = 'all';
let activeSection = 'clientes';

window.switchSectionTab = (section) => {
    activeSection = section;
    const tabClients = document.getElementById('tab-clients');
    const tabTesting = document.getElementById('tab-testing');
    const tabVip = document.getElementById('tab-vip');
    if (tabClients && tabTesting) {
        tabClients.classList.toggle('active', section === 'clientes');
        tabTesting.classList.toggle('active', section === 'testeo');
        if (tabVip) tabVip.classList.toggle('active', section === 'vip');
    }
    renderUsers();
    updateStats();
};

function getUserSection(u) {
    if (!u) return 'clientes';
    const sec = u.horario_activacion?._seccion;
    if (sec === 'vip' || (u.plan && u.plan.toLowerCase().includes('vip'))) return 'vip';
    if (sec === 'testeo' || u.usuario === 'paramostrarlealosclientes') return 'testeo';
    return 'clientes';
}

function getUserPrice(u) {
    if (!u || !u.horario_activacion) return 0;
    const p = u.horario_activacion._precio;
    return (p !== undefined && p !== null && !isNaN(p)) ? Number(p) : 0;
}

function formatCOP(num) {
    if (num === undefined || num === null || isNaN(num)) return '$0 COP';
    return '$' + Number(num).toLocaleString('es-CO') + ' COP';
}

function renderPriceCell(u) {
    const price = getUserPrice(u);
    const formatted = formatCOP(price);
    const safeUser = escapeHtml(u.usuario || '');
    return `
        <div style="display:inline-flex; align-items:center; gap:5px;">
            <span class="price-badge" style="font-family:monospace; font-size:12px;">${formatted}</span>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openPriceModal('${u.id}', '${safeUser}', ${price})" title="Modificar precio" style="padding:3px 6px; font-size:11px; cursor:pointer;">
                ✏️
            </button>
        </div>
    `;
}

function getUserPayment(u) {
    if (!u || !u.horario_activacion) return false;
    const p = u.horario_activacion._pago;
    return p === 'pago' || p === true;
}

function renderPaymentCell(u) {
    const isPaid = getUserPayment(u);
    return `
        <button type="button" class="btn-pago-toggle ${isPaid ? 'pago' : 'no-pago'}" onclick="togglePaymentStatus('${u.id}')" title="Clic para alternar estado de pago">
            ${isPaid ? '🟢 Pagó' : '🔴 No pagó'}
        </button>
    `;
}

window.togglePaymentStatus = async (id) => {
    const user = users.find(x => x.id === id);
    if (!user) return;

    const currentPaid = getUserPayment(user);
    const newPaidStatus = currentPaid ? 'no_pago' : 'pago';

    const updatedHorario = { ...(user.horario_activacion || {}) };
    updatedHorario._pago = newPaidStatus;

    // Actualización visual inmediata
    user.horario_activacion = updatedHorario;
    renderUsers();
    updateStats();

    try {
        const { error } = await supabaseClient
            .from('usuarios_app')
            .update({
                horario_activacion: updatedHorario,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            alert("Error actualizando estado de pago: " + error.message);
            await loadUsers();
        }
    } catch (e) {
        alert("Error de conexión al actualizar pago");
        await loadUsers();
    }
};

// Mostrar mensajes
function showMessage(elementId, message, type = '') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = type ? `message ${type}` : 'message';
    }
}

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    showMessage("login-message", "Iniciando sesión...", "");

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error("Error de login:", error);
            showMessage("login-message", error.message || "Error al iniciar sesión", "error");
            return;
        }

        const isOperator = await checkOperator(email);
        if (!isOperator) {
            await supabaseClient.auth.signOut();
            showMessage("login-message", "No tienes permisos de administrador", "error");
            return;
        }

        userEmail.textContent = email;
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        showMessage("login-message", "", "");

        await loadUsers();
        setInterval(loadUsers, 5000);
    } catch (error) {
        console.error("Error en login:", error);
        showMessage("login-message", "Error de conexión. Intenta nuevamente.", "error");
    }
});

// Verificar si es operador
async function checkOperator(email) {
    try {
        const { data, error } = await supabaseClient
            .from('operadores')
            .select('email')
            .eq('email', email)
            .single();

        return !error && !!data;
    } catch (error) {
        return false;
    }
}

// Logout
logoutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    dashboardScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginForm.reset();
});

// Cargar usuarios
async function loadUsers() {
    try {
        const { data, error } = await supabaseClient
            .from('usuarios_app')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Error cargando usuarios:", error);
            usersTableBody.innerHTML = '<tr><td colspan="6">Error cargando licencias</td></tr>';
            return;
        }

        users = data || [];
        renderUsers();
        updateStats();
    } catch (error) {
        console.error("Error en loadUsers:", error);
    }
}

// Estadísticas
function updateStats() {
    const clientsCount = users.filter(u => getUserSection(u) === 'clientes').length;
    const testingCount = users.filter(u => getUserSection(u) === 'testeo').length;
    const vipCount = users.filter(u => getUserSection(u) === 'vip').length;

    const countClientsEl = document.getElementById('count-clients');
    const countTestingEl = document.getElementById('count-testing');
    const countVipEl = document.getElementById('count-vip');
    if (countClientsEl) countClientsEl.textContent = clientsCount;
    if (countTestingEl) countTestingEl.textContent = testingCount;
    if (countVipEl) countVipEl.textContent = vipCount;

    const totalEl = document.getElementById('stat-total');
    const titleEl = document.getElementById('stat-title-count');
    const salesEl = document.getElementById('stat-sales');
    const salesCardEl = document.getElementById('stat-sales-card');
    const paidEl = document.getElementById('stat-paid');
    const pendingEl = document.getElementById('stat-pending');
    const paidCardEl = document.getElementById('stat-paid-card');
    const pendingCardEl = document.getElementById('stat-pending-card');

    if (activeSection === 'clientes') {
        if (totalEl) totalEl.textContent = clientsCount;
        if (titleEl) titleEl.textContent = 'Licencias Clientes';
        if (salesCardEl) salesCardEl.style.display = 'block';
        if (paidCardEl) paidCardEl.style.display = 'block';
        if (pendingCardEl) pendingCardEl.style.display = 'block';

        const clientUsers = users.filter(u => getUserSection(u) === 'clientes');
        const totalVentas = clientUsers.reduce((sum, u) => sum + getUserPrice(u), 0);
        const totalPagado = clientUsers.filter(u => getUserPayment(u)).reduce((sum, u) => sum + getUserPrice(u), 0);
        const totalPendiente = clientUsers.filter(u => !getUserPayment(u)).reduce((sum, u) => sum + getUserPrice(u), 0);

        if (salesEl) salesEl.textContent = formatCOP(totalVentas);
        if (paidEl) paidEl.textContent = formatCOP(totalPagado);
        if (pendingEl) pendingEl.textContent = formatCOP(totalPendiente);
    } else if (activeSection === 'vip') {
        if (totalEl) totalEl.textContent = vipCount;
        if (titleEl) titleEl.textContent = 'Licencias VIP 💎';
        if (salesCardEl) salesCardEl.style.display = 'none';
        if (paidCardEl) paidCardEl.style.display = 'none';
        if (pendingCardEl) pendingCardEl.style.display = 'none';
    } else {
        if (totalEl) totalEl.textContent = testingCount;
        if (titleEl) titleEl.textContent = 'Cuentas de Testeo';
        if (salesCardEl) salesCardEl.style.display = 'none';
        if (paidCardEl) paidCardEl.style.display = 'none';
        if (pendingCardEl) pendingCardEl.style.display = 'none';
    }
}

// Renderizado de usuarios
function renderUsers() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const now = new Date();

    let filtered = users.filter(u => {
        const matchesSection = getUserSection(u) === activeSection;
        const matchesSearch = !searchTerm || (u.usuario && u.usuario.toLowerCase().includes(searchTerm));
        return matchesSection && matchesSearch;
    });

    if (filtered.length === 0) {
        const secLabel = activeSection === 'clientes' ? 'Clientes' : (activeSection === 'vip' ? 'VIP 💎' : 'Testeo');
        usersTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:30px; color:#64748b;">No se encontraron licencias en la sección ${secLabel}</td></tr>`;
        return;
    }

    usersTableBody.innerHTML = filtered.map(u => {
        const isExpired = new Date(u.fecha_expiracion) <= now;
        const totalClasses = countTotalClasses(u.horario_activacion);

        const esPrueba15Min = u.plan && u.plan.toLowerCase().includes('minuto');

        let statusBadge = '';
        if (isExpired) {
            statusBadge = '<span class="badge expired">Expirada</span>';
        } else if (u.estado === 'activo') {
            if (!esPrueba15Min && totalClasses === 0 && getUserSection(u) !== 'vip') {
                statusBadge = '<span class="badge" style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">⚠️ Sin horario</span>';
            } else {
                statusBadge = '<span class="badge active">✅ Activa</span>';
            }
        } else {
            statusBadge = '<span class="badge inactive">❌ Inactiva</span>';
        }

        const isOnline = u.device_id && u.ultimo_latido && (now - new Date(u.ultimo_latido)) < 70 * 1000;
        const sessionCell = isOnline
            ? `<div style="display:inline-flex; align-items:center; gap:5px;">
                <span class="badge active" style="font-size:11px;">🟢 En línea</span>
                <button type="button" class="btn btn-secondary btn-sm" onclick="liberarSesionUsuario('${u.id}', '${escapeHtml(u.usuario || '')}')" title="Desconectar y liberar sesión inmediatamente" style="padding:2px 5px; font-size:10px; cursor:pointer;">🔄 Liberar</button>
               </div>`
            : `<span class="badge inactive" style="opacity:0.7; font-size:11px;">⚪ Libre</span>`;

        return `
            <tr>
                <td><strong>${escapeHtml(u.usuario || '')}</strong></td>
                <td>${renderPasswordCell(u)}</td>
                <td>${renderPriceCell(u)}</td>
                <td>${renderPaymentCell(u)}</td>
                <td><span class="badge">${escapeHtml(u.plan || 'Horario semanal')}</span></td>
                <td>
                    ${formatDate(u.fecha_expiracion)}
                    ${isExpired ? '<div style="font-size:11px; color:#ef4444; font-weight:600;">(Vencida)</div>' : ''}
                </td>
                <td>${renderScheduleCell(u, totalClasses)}</td>
                <td>${sessionCell}</td>
                <td>${statusBadge}</td>
                <td class="row-actions">
                    ${u.estado === 'activo'
                        ? `<button class="btn btn-action-pause btn-sm" onclick="toggleStatus('${u.id}', 'inactivo')">Pausar</button>`
                        : `<button class="btn btn-action-activate btn-sm" onclick="toggleStatus('${u.id}', 'activo')">Activar</button>`}
                    <button class="btn btn-action-delete btn-sm" onclick="deleteUser('${u.id}', '${escapeHtml(u.usuario)}')">Borrar</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Liberar sesión activa de un usuario
window.liberarSesionUsuario = async (id, username) => {
    if (!confirm(`¿Deseas liberar la sesión de "${username}" para que pueda volver a iniciar sesión o marcarse como libre?`)) return;

    try {
        const { error } = await supabaseClient
            .from('usuarios_app')
            .update({
                device_id: null,
                ultimo_latido: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            alert("Error al liberar sesión: " + error.message);
        } else {
            await loadUsers();
        }
    } catch (e) {
        alert("Error de conexión al liberar sesión");
    }
};

function countTotalClasses(horario) {
    if (!horario || typeof horario !== 'object') return 0;
    const unique = new Set();
    for (const day in horario) {
        if (Array.isArray(horario[day])) {
            horario[day].forEach(cls => {
                if (cls && cls.asignatura) {
                    const name = cls.asignatura.trim().toUpperCase();
                    if (name) unique.add(name);
                }
            });
        }
    }
    return unique.size;
}

function renderScheduleCell(u, totalClasses) {
    const isVip = getUserSection(u) === 'vip' || (u.plan && u.plan.toLowerCase().includes('vip'));
    if (isVip) {
        return `<span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #93c5fd; font-weight:700; font-size:11px; padding:4px 8px;">💎 Ilimitado (24/7)</span>`;
    }
    const esPrueba15Min = u.plan && u.plan.toLowerCase().includes('minuto');
    if (totalClasses > 0) {
        return `
            <button class="btn btn-secondary btn-sm" onclick="openScheduleEditor('${u.id}')" style="display:inline-flex; align-items:center; gap:5px;">
                <span>📅 Horario</span>
                <span class="badge active" style="font-size:10px; padding:2px 6px;">${totalClasses}</span>
            </button>
        `;
    }
    if (esPrueba15Min) {
        return `<span style="color:#64748b; font-size:12px;">⚡ Sin horario (15 min)</span>`;
    }
    return `
        <button class="btn btn-secondary btn-sm" onclick="openScheduleEditor('${u.id}')" style="background:#fef2f2; border:1px solid #fecaca; color:#dc2626; font-size:11px; font-weight:600;" title="Sin materias configuradas. Estará bloqueado hasta que le asignes horario.">
            <span>⚠️ Sin materias (Bloqueado)</span>
        </button>
    `;
}

// Alternar estado activo/inactivo
window.toggleStatus = async (id, nuevoEstado) => {
    try {
        const { error } = await supabaseClient
            .from('usuarios_app')
            .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) alert("Error actualizando estado: " + error.message);
        else await loadUsers();
    } catch (e) {
        alert("Error de conexión");
    }
};

// Borrar usuario
window.deleteUser = async (id, username) => {
    if (!confirm(`¿Estás seguro de eliminar permanentemente la licencia de "${username}"?`)) return;

    try {
        const { error } = await supabaseClient
            .from('usuarios_app')
            .delete()
            .eq('id', id);

        if (error) alert("Error eliminando: " + error.message);
        else await loadUsers();
    } catch (e) {
        alert("Error de conexión");
    }
};

// ==========================================
// GESTIÓN DE CONTRASEÑA (VER Y MODIFICAR)
// ==========================================

function renderPasswordCell(u) {
    const pass = escapeHtml(u.password || '');
    return `
        <div style="display:inline-flex; align-items:center; gap:5px;">
            <span id="pass-display-${u.id}" data-masked="true" style="font-family:monospace; font-size:12px; background:#f8fafc; padding:3px 8px; border-radius:4px; border:1px solid #cbd5e1; min-width:70px; display:inline-block; text-align:center; color:#334155;">••••••••</span>
            <button type="button" class="btn btn-secondary btn-sm" onclick="togglePasswordVisibility('${u.id}', '${pass}')" title="Ver / Ocultar contraseña" style="padding:3px 6px; font-size:11px; cursor:pointer;">
                👁️
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openPasswordModal('${u.id}', '${escapeHtml(u.usuario || '')}', '${pass}')" title="Modificar contraseña" style="padding:3px 6px; font-size:11px; cursor:pointer;">
                ✏️
            </button>
        </div>
    `;
}

window.togglePasswordVisibility = (id, actualPass) => {
    const span = document.getElementById(`pass-display-${id}`);
    if (!span) return;
    const isMasked = span.dataset.masked === 'true';
    if (isMasked) {
        span.textContent = actualPass;
        span.dataset.masked = 'false';
        span.style.background = '#fef3c7';
        span.style.color = '#92400e';
        span.style.fontWeight = 'bold';
    } else {
        span.textContent = '••••••••';
        span.dataset.masked = 'true';
        span.style.background = '#f8fafc';
        span.style.color = '#334155';
        span.style.fontWeight = 'normal';
    }
};

const passwordModal = document.getElementById('password-modal');
const passwordModalForm = document.getElementById('password-modal-form');

window.openPasswordModal = (id, username, currentPass) => {
    document.getElementById('edit-pass-user-id').value = id;
    document.getElementById('edit-pass-username').value = username;
    const inputPass = document.getElementById('edit-pass-newpass');
    inputPass.value = currentPass;
    showMessage("password-modal-message", "", "");
    passwordModal.classList.remove('hidden');
    setTimeout(() => inputPass.focus(), 100);
};

window.closePasswordModal = () => {
    passwordModal.classList.add('hidden');
    passwordModalForm.reset();
};

passwordModalForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-pass-user-id').value;
    const newPass = document.getElementById('edit-pass-newpass').value.trim();

    if (!newPass) {
        showMessage("password-modal-message", "La contraseña no puede estar vacía", "error");
        return;
    }

    showMessage("password-modal-message", "Guardando contraseña...", "");

    try {
        const { error } = await supabaseClient
            .from('usuarios_app')
            .update({ password: newPass, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            showMessage("password-modal-message", "Error al actualizar: " + error.message, "error");
            return;
        }

        closePasswordModal();
        await loadUsers();
    } catch (err) {
        showMessage("password-modal-message", "Error de conexión", "error");
    }
});

// ==========================================
// GESTIÓN DE PRECIO (MODIFICAR PRECIO)
// ==========================================
const priceModal = document.getElementById('price-modal');
const priceModalForm = document.getElementById('price-modal-form');

window.openPriceModal = (id, username, currentPrice) => {
    document.getElementById('edit-price-user-id').value = id;
    document.getElementById('edit-price-username').value = username;
    const inputPrice = document.getElementById('edit-price-val');
    inputPrice.value = currentPrice || 0;
    showMessage("price-modal-message", "", "");
    priceModal.classList.remove('hidden');
    setTimeout(() => inputPrice.focus(), 100);
};

window.closePriceModal = () => {
    priceModal.classList.add('hidden');
    priceModalForm.reset();
};

priceModalForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-price-user-id').value;
    const newPrice = Number(document.getElementById('edit-price-val').value) || 0;

    const user = users.find(x => x.id === id);
    if (!user) return;

    const updatedHorario = { ...(user.horario_activacion || {}) };
    updatedHorario._precio = newPrice;

    showMessage("price-modal-message", "Guardando precio...", "");

    try {
        const { error } = await supabaseClient
            .from('usuarios_app')
            .update({
                horario_activacion: updatedHorario,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            showMessage("price-modal-message", "Error al actualizar precio: " + error.message, "error");
            return;
        }

        closePriceModal();
        await loadUsers();
    } catch (err) {
        showMessage("price-modal-message", "Error de conexión", "error");
    }
});

searchInput.addEventListener('input', renderUsers);

// ==========================================
// MODAL CREAR LICENCIA: 15 MIN, HORARIO SEMANAL O VIP
// ==========================================

const radioTest = document.getElementById('radio-type-test');
const radioSchedule = document.getElementById('radio-type-schedule');
const radioVip = document.getElementById('radio-type-vip');
const cardTest = document.getElementById('card-type-test');
const cardSchedule = document.getElementById('card-type-schedule');
const cardVip = document.getElementById('card-type-vip');
const testBox = document.getElementById('test-info-box');
const vipBox = document.getElementById('vip-info-box');
const scheduleSection = document.getElementById('schedule-quizzes-section');

function updateLicenseTypeUI() {
    if (radioTest && radioTest.checked) {
        if (cardTest) cardTest.classList.add('active');
        if (cardSchedule) cardSchedule.classList.remove('active');
        if (cardVip) cardVip.classList.remove('active');
        if (testBox) testBox.classList.remove('hidden');
        if (vipBox) vipBox.classList.add('hidden');
        if (scheduleSection) scheduleSection.classList.add('hidden');
    } else if (radioVip && radioVip.checked) {
        if (cardTest) cardTest.classList.remove('active');
        if (cardSchedule) cardSchedule.classList.remove('active');
        if (cardVip) cardVip.classList.add('active');
        if (testBox) testBox.classList.add('hidden');
        if (vipBox) vipBox.classList.remove('hidden');
        if (scheduleSection) scheduleSection.classList.add('hidden');

        // Valores automáticos para VIP
        const userPriceEl = document.getElementById('user-price');
        if (userPriceEl) userPriceEl.value = '0';
        const userPaymentEl = document.getElementById('user-payment');
        if (userPaymentEl) userPaymentEl.value = 'pago';
        const userSectionEl = document.getElementById('user-section');
        if (userSectionEl && userSectionEl.value !== 'vip') userSectionEl.value = 'vip';
    } else {
        if (cardTest) cardTest.classList.remove('active');
        if (cardSchedule) cardSchedule.classList.add('active');
        if (cardVip) cardVip.classList.remove('active');
        if (testBox) testBox.classList.add('hidden');
        if (vipBox) vipBox.classList.add('hidden');
        if (scheduleSection) scheduleSection.classList.remove('hidden');
        generateScheduleTable();
    }
}

if (radioTest) radioTest.addEventListener('change', updateLicenseTypeUI);
if (radioSchedule) radioSchedule.addEventListener('change', updateLicenseTypeUI);
if (radioVip) radioVip.addEventListener('change', updateLicenseTypeUI);

document.getElementById('user-section')?.addEventListener('change', (e) => {
    if (e.target.value === 'vip' && radioVip) {
        radioVip.checked = true;
        updateLicenseTypeUI();
    }
});

createUserBtn.addEventListener('click', () => {
    userModalForm.reset();
    document.querySelectorAll('#schedule-table input.schedule-cell-input').forEach(i => {
        i.value = '';
        updateCellVisual(i);
    });

    const userSectionEl = document.getElementById('user-section');
    if (userSectionEl) userSectionEl.value = activeSection;

    const userPaymentEl = document.getElementById('user-payment');
    if (userPaymentEl) userPaymentEl.value = 'pago';

    if (activeSection === 'vip') {
        if (radioVip) radioVip.checked = true;
        const userPriceEl = document.getElementById('user-price');
        if (userPriceEl) userPriceEl.value = '0';
    } else {
        if (radioTest) radioTest.checked = true;
    }
    updateLicenseTypeUI();

    userModal.classList.remove('hidden');
    showMessage("user-modal-message", "", "");
});

cancelUserModal.addEventListener('click', () => {
    userModal.classList.add('hidden');
});

// Guardar nueva licencia
userModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('user-username').value.trim();
    const password = document.getElementById('user-password').value.trim();
    const userSection = document.getElementById('user-section')?.value || 'clientes';
    const userPrice = Number(document.getElementById('user-price')?.value) || 0;
    const userPayment = document.getElementById('user-payment')?.value || 'pago';

    if (!username || !password) {
        showMessage("user-modal-message", "Ingresa usuario y contraseña", "error");
        return;
    }

    const licenseType = document.querySelector('input[name="license-type-radio"]:checked')?.value || 'test';

    let planNombre = '';
    let expiracion = new Date();
    let horario = {};

    if (licenseType === 'test') {
        planNombre = '15 minutos (Prueba)';
        expiracion = new Date(Date.now() + 15 * 60 * 1000);
        horario = {};
    } else if (licenseType === 'vip' || userSection === 'vip') {
        planNombre = 'VIP Ilimitado (24/7)';
        expiracion = new Date('2099-12-31T23:59:59Z');
        horario = {};
        SCHEDULE_DAYS.forEach(day => {
            horario[day.key] = [{ hora: '00:00 - 24:00', asignatura: 'VIP ILIMITADO' }];
        });
    } else {
        planNombre = 'Horario semanal';
        expiracion.setFullYear(expiracion.getFullYear() + 1);

        const inputs = document.querySelectorAll('#schedule-table input.schedule-cell-input');
        horario = {};

        inputs.forEach(input => {
            const val = input.value.trim().toUpperCase();
            if (val) {
                const day = input.dataset.day;
                const dbHour = input.dataset.dbHour;
                if (!horario[day]) horario[day] = [];
                horario[day].push({ hora: dbHour, asignatura: val });
            }
        });

        if (Object.keys(horario).length === 0) {
            showMessage("user-modal-message", "Escribe al menos una materia en el horario de clases antes de crear la licencia", "error");
            return;
        }
    }

    horario._precio = userPrice;
    horario._seccion = userSection;
    horario._pago = userPayment;

    showMessage("user-modal-message", "Creando licencia...", "");

    try {
        const { error } = await supabaseClient
            .from('usuarios_app')
            .insert({
                usuario: username,
                password: password,
                plan: planNombre,
                fecha_expiracion: expiracion.toISOString(),
                horario_activacion: horario,
                estado: 'activo',
                ultimo_latido: null,
                device_id: null
            });

        if (error) {
            showMessage("user-modal-message", error.message || "Error al crear", "error");
            return;
        }

        userModal.classList.add('hidden');
        await loadUsers();
    } catch (e) {
        showMessage("user-modal-message", "Error de conexión", "error");
    }
});

// ==========================================
// CONFIGURACIÓN Y GENERADOR DEL HORARIO (PORTAL UNIVERSITARIO)
// ==========================================

const SCHEDULE_DAYS = [
    { key: 'lunes', label: 'Lunes' },
    { key: 'martes', label: 'Martes' },
    { key: 'miércoles', label: 'Miércoles' },
    { key: 'jueves', label: 'Jueves' },
    { key: 'viernes', label: 'Viernes' },
    { key: 'sábado', label: 'Sábado' },
    { key: 'domingo', label: 'Domingo' }
];

function getScheduleHours() {
    const list = [];
    for (let h = 6; h <= 23; h++) {
        const nextH = (h + 1) % 24;
        const period1 = h < 12 ? 'am' : 'pm';
        const h12_1 = h % 12 === 0 ? 12 : h % 12;
        const period2 = (h + 1) < 12 || (h + 1) === 24 ? 'am' : 'pm';
        const h12_2 = nextH % 12 === 0 ? 12 : nextH % 12;

        const displayLabel = `${String(h12_1).padStart(2, '0')} ${period1} - ${String(h12_2).padStart(2, '0')} ${period2}`;
        const dbHour = `${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00`;

        list.push({
            startH: h,
            display: displayLabel,
            dbHour: dbHour
        });
    }
    return list;
}

function updateCellVisual(input) {
    if (input.value) {
        input.value = input.value.toUpperCase();
    }
    const td = input.closest('td');
    if (input.value && input.value.trim() !== '') {
        input.classList.add('filled');
        if (td) td.classList.add('has-class');
    } else {
        input.classList.remove('filled');
        if (td) td.classList.remove('has-class');
    }
}

// Generar tabla en Modal de Creación
function generateScheduleTable() {
    const tbody = document.getElementById('schedule-table-body');
    if (!tbody || tbody.children.length > 0) return;

    tbody.innerHTML = '';
    const hours = getScheduleHours();

    hours.forEach(item => {
        const row = document.createElement('tr');
        const hourCell = document.createElement('td');
        hourCell.className = 'cell-hora';
        hourCell.textContent = item.display;
        row.appendChild(hourCell);

        SCHEDULE_DAYS.forEach(day => {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'schedule-cell-input';
            input.placeholder = '--';
            input.dataset.day = day.key;
            input.dataset.dbHour = item.dbHour;
            input.dataset.display = item.display;

            input.addEventListener('input', () => {
                input.value = input.value.toUpperCase();
                updateCellVisual(input);
                updateCreateCounter();
            });

            cell.appendChild(input);
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    updateCreateCounter();
}

function updateCreateCounter() {
    const counterEl = document.getElementById('create-schedule-counter');
    if (!counterEl) return;
    const inputs = document.querySelectorAll('#schedule-table input.schedule-cell-input');
    const unique = new Set();
    inputs.forEach(input => {
        const val = input.value.trim().toUpperCase();
        if (val) unique.add(val);
    });
    const count = unique.size;
    counterEl.textContent = `${count} ${count === 1 ? 'materia asignada' : 'materias asignadas'}`;
}

document.getElementById('btn-clear-schedule')?.addEventListener('click', () => {
    document.querySelectorAll('#schedule-table input.schedule-cell-input').forEach(i => {
        i.value = '';
        updateCellVisual(i);
    });
    updateCreateCounter();
});

// ==========================================
// MODAL EDITOR DE HORARIO EXISTENTE
// ==========================================

let currentEditingUserId = null;

window.openScheduleEditor = (id) => {
    const u = users.find(x => x.id === id);
    if (!u) return;

    currentEditingUserId = id;
    document.getElementById('schedule-modal-title').textContent = `📅 Horario: ${u.usuario}`;
    buildEditScheduleTable(u.horario_activacion);
    document.getElementById('schedule-modal').classList.remove('hidden');
    showMessage("schedule-modal-message", "", "");
};

window.closeScheduleModal = () => {
    document.getElementById('schedule-modal').classList.add('hidden');
    currentEditingUserId = null;
};

function buildEditScheduleTable(existingSchedule) {
    const tbody = document.getElementById('edit-schedule-table-body');
    tbody.innerHTML = '';

    const hours = getScheduleHours();

    hours.forEach(item => {
        const row = document.createElement('tr');
        const hourCell = document.createElement('td');
        hourCell.className = 'cell-hora';
        hourCell.textContent = item.display;
        row.appendChild(hourCell);

        SCHEDULE_DAYS.forEach(day => {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'schedule-cell-input';
            input.placeholder = '--';
            input.dataset.day = day.key;
            input.dataset.dbHour = item.dbHour;
            input.dataset.display = item.display;

            // Buscar si ya tiene materia en este bloque
            const dayList = existingSchedule ? (existingSchedule[day.key] || existingSchedule[day.key.normalize("NFD").replace(/[\u0300-\u036f]/g, "")]) : null;
            if (Array.isArray(dayList)) {
                const match = dayList.find(cls => {
                    if (!cls || !cls.hora) return false;
                    return cls.hora.startsWith(String(item.startH).padStart(2, '0')) ||
                           cls.hora === item.display ||
                           cls.hora === item.dbHour;
                });
                if (match && match.asignatura) {
                    input.value = match.asignatura.toUpperCase();
                }
            }

            input.addEventListener('input', () => {
                input.value = input.value.toUpperCase();
                updateCellVisual(input);
                updateEditCounter();
            });

            updateCellVisual(input);
            cell.appendChild(input);
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    updateEditCounter();
}

function updateEditCounter() {
    const counterEl = document.getElementById('edit-schedule-counter');
    if (!counterEl) return;
    const inputs = document.querySelectorAll('#edit-schedule-table input.schedule-cell-input');
    const unique = new Set();
    inputs.forEach(input => {
        const val = input.value.trim().toUpperCase();
        if (val) unique.add(val);
    });
    const count = unique.size;
    counterEl.textContent = `${count} ${count === 1 ? 'materia asignada' : 'materias asignadas'}`;
}

window.clearEditScheduleTable = () => {
    document.querySelectorAll('#edit-schedule-table input.schedule-cell-input').forEach(i => {
        i.value = '';
        updateCellVisual(i);
    });
    updateEditCounter();
};

window.saveUserSchedule = async () => {
    if (!currentEditingUserId) return;

    const inputs = document.querySelectorAll('#edit-schedule-table input.schedule-cell-input');
    const schedule = {};

    inputs.forEach(input => {
        const val = input.value.trim().toUpperCase();
        if (val) {
            const day = input.dataset.day;
            const hour = input.dataset.dbHour;
            if (!schedule[day]) schedule[day] = [];
            schedule[day].push({ hora: hour, asignatura: val });
        }
    });

    // Preservar precio y sección existentes al guardar el horario
    const existingUser = users.find(x => x.id === currentEditingUserId);
    if (existingUser && existingUser.horario_activacion) {
        if (existingUser.horario_activacion._precio !== undefined) {
            schedule._precio = existingUser.horario_activacion._precio;
        }
        if (existingUser.horario_activacion._seccion !== undefined) {
            schedule._seccion = existingUser.horario_activacion._seccion;
        }
        if (existingUser.horario_activacion._pago !== undefined) {
            schedule._pago = existingUser.horario_activacion._pago;
        }
    }

    try {
        const { error } = await supabaseClient
            .from('usuarios_app')
            .update({
                horario_activacion: schedule,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentEditingUserId);

        if (error) {
            showMessage("schedule-modal-message", "Error guardando: " + error.message, "error");
            return;
        }

        closeScheduleModal();
        await loadUsers();
    } catch (e) {
        showMessage("schedule-modal-message", "Error de conexión", "error");
    }
};

// ==========================================
// CAPTURA / FOTO DEL HORARIO (HTML2CANVAS)
// ==========================================

window.downloadSchedulePhoto = async () => {
    const card = document.querySelector('#schedule-modal .schedule-table-card');
    if (!card) return;

    if (typeof html2canvas === 'undefined') {
        alert("La librería de captura aún está cargando. Intenta de nuevo en unos segundos.");
        return;
    }

    const btn = document.getElementById('btn-screenshot-schedule');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '⏳ Generando...';

    try {
        // Clonar la tarjeta fuera de pantalla para renderizarla completa y sin barras de scroll
        const clone = card.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.top = '-99999px';
        clone.style.left = '-99999px';
        clone.style.width = '1000px';
        clone.style.maxHeight = 'none';
        clone.style.height = 'auto';
        clone.style.zIndex = '-1000';
        clone.style.background = '#ffffff';

        // Remover botones dentro del banner del clon para que salga limpia
        clone.querySelectorAll('button').forEach(b => b.remove());

        const cloneContainer = clone.querySelector('.schedule-table-container');
        if (cloneContainer) {
            cloneContainer.style.maxHeight = 'none';
            cloneContainer.style.overflow = 'visible';
            cloneContainer.style.height = 'auto';
            cloneContainer.style.border = 'none';
        }

        // Reemplazar inputs por divs con texto nítido en el clon
        const originalInputs = card.querySelectorAll('input.schedule-cell-input');
        const cloneInputs = clone.querySelectorAll('input.schedule-cell-input');
        cloneInputs.forEach((clonedInput, index) => {
            const orig = originalInputs[index];
            const val = orig ? orig.value.trim().toUpperCase() : '';
            const parentTd = clonedInput.closest('td');

            const div = document.createElement('div');
            div.style.width = '100%';
            div.style.minHeight = '46px';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';
            div.style.padding = '4px';
            div.style.fontSize = '11px';
            div.style.fontWeight = 'bold';
            div.style.lineHeight = '1.2';
            div.style.textAlign = 'center';

            if (val) {
                div.textContent = val;
                div.style.color = '#801424';
                div.style.backgroundColor = '#E8EEF7';
                if (parentTd) parentTd.style.backgroundColor = '#E8EEF7';
            } else {
                div.textContent = '--';
                div.style.color = '#cbd5e1';
                div.style.fontWeight = 'normal';
                if (parentTd) parentTd.style.backgroundColor = '#ffffff';
            }
            clonedInput.parentNode.replaceChild(div, clonedInput);
        });

        // Título personalizado con el nombre del usuario
        const username = document.getElementById('schedule-modal-title')?.textContent?.replace('📅 Horario:', '')?.trim() || 'Alumno';
        const cloneBannerTitle = clone.querySelector('.schedule-table-banner span');
        if (cloneBannerTitle) {
            cloneBannerTitle.textContent = `📚 Horario de Clases - ${username}`;
        }

        document.body.appendChild(clone);

        // Captura con html2canvas en escala 2 (alta resolución)
        const canvas = await html2canvas(clone, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: 1024
        });

        document.body.removeChild(clone);

        // 1. Descargar imagen PNG
        const image = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Horario_${username.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
        link.href = image;
        link.click();

        // 2. Intentar copiar al portapapeles para pegar directo en WhatsApp/Telegram (Ctrl + V)
        if (navigator.clipboard && window.ClipboardItem) {
            canvas.toBlob(blob => {
                if (blob) {
                    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
                }
            });
        }
    } catch (err) {
        console.error('Error generando foto:', err);
        alert('Error generando la foto del horario: ' + err.message);
    } finally {
        if (btn) btn.innerHTML = originalText;
    }
};

// Utilidades
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
