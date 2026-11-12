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
let quizesList = [];
window.scheduleData = {};

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
    const totalEl = document.getElementById('stat-total');
    if (totalEl) totalEl.textContent = users.length;
}

// Renderizado de usuarios
function renderUsers() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const now = new Date();

    let filtered = users.filter(u => {
        return !searchTerm || (u.usuario && u.usuario.toLowerCase().includes(searchTerm));
    });

    if (filtered.length === 0) {
        usersTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#64748b;">No se encontraron licencias</td></tr>';
        return;
    }

    usersTableBody.innerHTML = filtered.map(u => {
        const isExpired = new Date(u.fecha_expiracion) <= now;
        const totalClasses = countTotalClasses(u.horario_activacion);

        let statusBadge = '';
        if (isExpired) {
            statusBadge = '<span class="badge expired">Expirada</span>';
        } else if (u.estado === 'activo') {
            statusBadge = '<span class="badge active">Activa</span>';
        } else {
            statusBadge = '<span class="badge inactive">Inactiva</span>';
        }

        const isOnline = u.ultimo_latido && (now - new Date(u.ultimo_latido)) < 70 * 1000;
        const sessionCell = isOnline
            ? `<span class="badge active" style="font-size:11px;">🟢 En línea</span>`
            : `<span class="badge inactive" style="opacity:0.7; font-size:11px;">⚪ Libre</span>`;

        return `
            <tr>
                <td><strong>${escapeHtml(u.usuario || '')}</strong></td>
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
                        ? `<button class="btn btn-secondary btn-sm" onclick="toggleStatus('${u.id}', 'inactivo')">Pausar</button>`
                        : `<button class="btn btn-primary btn-sm" onclick="toggleStatus('${u.id}', 'activo')">Activar</button>`}
                    <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}', '${escapeHtml(u.usuario)}')">Borrar</button>
                </td>
            </tr>
        `;
    }).join('');
}

function countTotalClasses(horario) {
    if (!horario || typeof horario !== 'object') return 0;
    let count = 0;
    for (const day in horario) {
        if (Array.isArray(horario[day])) count += horario[day].length;
    }
    return count;
}

function renderScheduleCell(u, totalClasses) {
    if (totalClasses > 0) {
        return `
            <button class="btn btn-secondary btn-sm" onclick="openScheduleEditor('${u.id}')" style="display:inline-flex; align-items:center; gap:5px;">
                <span>📅 Horario</span>
                <span class="badge active" style="font-size:10px; padding:2px 6px;">${totalClasses}</span>
            </button>
        `;
    }
    return `
        <button class="btn btn-secondary btn-sm" onclick="openScheduleEditor('${u.id}')" style="opacity:0.75; font-size:12px;">
            <span>➕ Programar</span>
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

searchInput.addEventListener('input', renderUsers);

// ==========================================
// MODAL CREAR LICENCIA: 15 MIN O HORARIO SEMANAL
// ==========================================

const radioTest = document.getElementById('radio-type-test');
const radioSchedule = document.getElementById('radio-type-schedule');
const cardTest = document.getElementById('card-type-test');
const cardSchedule = document.getElementById('card-type-schedule');
const testBox = document.getElementById('test-info-box');
const scheduleSection = document.getElementById('schedule-quizzes-section');

function updateLicenseTypeUI() {
    if (radioTest.checked) {
        cardTest.classList.add('active');
        cardSchedule.classList.remove('active');
        testBox.classList.remove('hidden');
        scheduleSection.classList.add('hidden');
    } else {
        cardTest.classList.remove('active');
        cardSchedule.classList.add('active');
        testBox.classList.add('hidden');
        scheduleSection.classList.remove('hidden');
        generateScheduleTable();
    }
}

radioTest.addEventListener('change', updateLicenseTypeUI);
radioSchedule.addEventListener('change', updateLicenseTypeUI);

createUserBtn.addEventListener('click', () => {
    userModalForm.reset();
    quizesList = [];
    window.scheduleData = {};
    renderQuizList();

    radioTest.checked = true;
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
    } else {
        if (!window.scheduleData || Object.keys(window.scheduleData).length === 0) {
            showMessage("user-modal-message", "Llena las materias y haz clic en 'Generar Horario' antes de guardar", "error");
            return;
        }

        planNombre = 'Horario semanal';
        // Vigencia de 1 año para repetirse todas las semanas según su horario
        expiracion.setFullYear(expiracion.getFullYear() + 1);

        const dayMapping = {
            'lunes': 'lunes',
            'martes': 'martes',
            'miercoles': 'miércoles',
            'jueves': 'jueves',
            'viernes': 'viernes',
            'sabado': 'sábado'
        };

        for (const [dayName, classes] of Object.entries(window.scheduleData)) {
            const dayKey = dayMapping[dayName] || dayName;
            horario[dayKey] = classes.map(cls => {
                const [startStr, endStr] = cls.hour.split(' - ');
                let [sh, sp] = startStr.split(' ');
                let [eh, ep] = endStr.split(' ');
                sh = parseInt(sh);
                eh = parseInt(eh);
                if (sp === 'pm' && sh !== 12) sh += 12;
                if (sp === 'am' && sh === 12) sh = 0;
                if (ep === 'pm' && eh !== 12) eh += 12;
                if (ep === 'am' && eh === 12) eh = 0;

                return {
                    hora: `${String(sh).padStart(2, '0')}:00 - ${String(eh).padStart(2, '0')}:00`,
                    asignatura: cls.materia
                };
            });
        }
    }

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
                estado: 'activo'
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
// TABLA DE HORARIO EN MODAL DE CREACIÓN
// ==========================================

function generateScheduleTable() {
    const tbody = document.getElementById('schedule-table-body');
    if (!tbody || tbody.children.length > 0) return;

    tbody.innerHTML = '';
    const hours = [];
    for (let h = 6; h <= 22; h++) {
        const period = h < 12 ? 'am' : 'pm';
        const hour12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        const nextH = h + 1;
        const nextPeriod = nextH < 12 ? 'am' : 'pm';
        const nextHour12 = nextH > 12 ? nextH - 12 : (nextH === 0 ? 12 : nextH);
        hours.push(`${String(hour12).padStart(2, '0')} ${period} - ${String(nextHour12).padStart(2, '0')} ${nextPeriod}`);
    }

    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

    hours.forEach(hour => {
        const row = document.createElement('tr');
        const hourCell = document.createElement('td');
        hourCell.textContent = hour;
        row.appendChild(hourCell);

        days.forEach(day => {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '--';
            input.dataset.day = day;
            input.dataset.hour = hour;
            cell.appendChild(input);
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });
}

document.getElementById('btn-clear-schedule')?.addEventListener('click', () => {
    document.querySelectorAll('#schedule-table input').forEach(i => i.value = '');
    quizesList = [];
    window.scheduleData = {};
    renderQuizList();
});

document.getElementById('btn-generate-quizzes')?.addEventListener('click', () => {
    const inputs = document.querySelectorAll('#schedule-table input');
    const scheduleData = {};

    inputs.forEach(input => {
        const val = input.value.trim();
        if (val) {
            const day = input.dataset.day;
            const hour = input.dataset.hour;
            if (!scheduleData[day]) scheduleData[day] = [];
            scheduleData[day].push({ hour, materia: val });
        }
    });

    if (Object.keys(scheduleData).length === 0) {
        alert("Escribe al menos una materia en la cuadrícula de horarios");
        return;
    }

    window.scheduleData = scheduleData;
    quizesList = [];
    const dayLabels = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado' };

    for (const d in scheduleData) {
        scheduleData[d].forEach(cls => {
            quizesList.push({ day: dayLabels[d] || d, hour: cls.hour, materia: cls.materia });
        });
    }

    renderQuizList();
});

function renderQuizList() {
    const list = document.getElementById('quizzes-list');
    const noMsg = document.getElementById('no-quizzes-msg');
    const count = document.getElementById('quizzes-count');

    if (count) count.textContent = quizesList.length;
    if (!list) return;

    list.querySelectorAll('.quiz-card-item').forEach(c => c.remove());

    if (quizesList.length === 0) {
        if (noMsg) noMsg.style.display = 'block';
        return;
    }

    if (noMsg) noMsg.style.display = 'none';

    quizesList.forEach((q, index) => {
        const card = document.createElement('div');
        card.className = 'quiz-card-item';
        card.innerHTML = `
            <div class="quiz-card-info">
                <span class="quiz-card-title">${q.day}: ${escapeHtml(q.materia)}</span>
                <span class="quiz-card-time">🕐 ${q.hour}</span>
            </div>
            <button type="button" class="btn-remove-quiz" onclick="removeQuiz(${index})">✕</button>
        `;
        list.appendChild(card);
    });
}

window.removeQuiz = (index) => {
    quizesList.splice(index, 1);
    renderQuizList();
};

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

    const hours = [];
    for (let h = 6; h <= 22; h++) {
        hours.push({
            startH: h,
            label: `${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00`
        });
    }

    const days = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

    hours.forEach(item => {
        const row = document.createElement('tr');
        const hourCell = document.createElement('td');
        hourCell.textContent = item.label;
        hourCell.style.fontWeight = "bold";
        row.appendChild(hourCell);

        days.forEach(day => {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '--';
            input.dataset.day = day;
            input.dataset.hour = item.label;

            if (existingSchedule && existingSchedule[day]) {
                const match = existingSchedule[day].find(cls => cls.hora.startsWith(String(item.startH).padStart(2, '0')));
                if (match) input.value = match.asignatura;
            }

            cell.appendChild(input);
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });
}

window.clearEditScheduleTable = () => {
    document.querySelectorAll('#edit-schedule-table input').forEach(i => i.value = '');
};

window.saveUserSchedule = async () => {
    if (!currentEditingUserId) return;

    const inputs = document.querySelectorAll('#edit-schedule-table input');
    const schedule = {};

    inputs.forEach(input => {
        const val = input.value.trim();
        if (val) {
            const day = input.dataset.day;
            const hour = input.dataset.hour;
            if (!schedule[day]) schedule[day] = [];
            schedule[day].push({ hora: hour, asignatura: val });
        }
    });

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
