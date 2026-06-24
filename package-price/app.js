const CORRECT_PASSWORD = '00luxpath00';
const SUPABASE_URL = 'https://eswvhssnfhogxmjsapms.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzd3Zoc3NuZmhvZ3htanNhcG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjYxMTEsImV4cCI6MjA5Njk0MjExMX0.-lOpbQyPn8Ycwu_jkSUzAl-1wrvjCiEzr-LExPBaZdE';

let db;

const LS_AUTH_KEY = 'pp_auth_v1';

function _showDashboard() {
    document.getElementById('pw_gate').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    initDashboard();
}

// Password check
function checkPassword() {
    const val = document.getElementById('pw_input').value;
    if (val === CORRECT_PASSWORD) {
        localStorage.setItem(LS_AUTH_KEY, '1');
        _showDashboard();
    } else {
        document.getElementById('pw_error').textContent = val.trim() === '' ? 'يرجى إدخال كلمة المرور' : 'كلمة المرور غير صحيحة';
    }
}

// Enter key on password input + auto-login if already authenticated
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem(LS_AUTH_KEY) === '1') {
        _showDashboard();
        return;
    }
    document.getElementById('pw_input').addEventListener('keydown', e => {
        if (e.key === 'Enter') checkPassword();
    });
    document.getElementById('pw_input').focus();
});

function initDashboard() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        setTimeout(initDashboard, 100);
        return;
    }
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadPrices();
    loadSettings();
}

async function loadPrices() {
    const tbody = document.getElementById('prices_tbody');
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:24px;color:#888">جاري التحميل...</td></tr>`;

    const { data, error } = await db.from('package_prices').select('*').order('id');
    if (error) { showStatus('خطأ في تحميل البيانات: ' + error.message, 'error'); return; }

    tbody.innerHTML = '';
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.dataset.id = row.id;
        tr.innerHTML = `
            <td><span class="city_badge" data-field="city">${row.city}</span></td>
            <td><span class="pv" data-field="transport">${Number(row.transport_price_per_day).toLocaleString('en-US')}</span></td>
            <td>
                <button class="edit_btn" onclick="startEdit(this)">تعديل</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function startEdit(btn) {
    const tr = btn.closest('tr');

    const citySpan      = tr.querySelector('[data-field="city"]');
    const transportSpan = tr.querySelector('[data-field="transport"]');
    const origCity      = citySpan.textContent.trim();
    const origTransport = parseInt(transportSpan.textContent.trim().replace(/,/g, '')) || 0;

    // Stash originals so cancel can restore without a network call
    tr.dataset.origCity      = origCity;
    tr.dataset.origTransport = origTransport;

    citySpan.outerHTML = `<input class="city_inp" data-field="city" value="${origCity}">`;
    transportSpan.outerHTML = `<input class="price_inp" data-field="transport" value="${Number(origTransport).toLocaleString('en-US')}" oninput="fmtInp(this)">`;

    btn.parentElement.innerHTML = `
        <div class="row_action_btns">
            <button class="cancel_btn_dash" onclick="cancelEdit(this)">إلغاء</button>
            <button class="save_btn" onclick="saveRow(this)">حفظ</button>
        </div>
    `;

    tr.querySelector('.city_inp').focus();
}

function cancelEdit(btn) {
    const tr = btn.closest('tr');
    _revertRowToView(tr, tr.dataset.origCity || '', parseInt(tr.dataset.origTransport) || 0);
}

function _revertRowToView(tr, city, transport) {
    tr.querySelector('[data-field="city"]').outerHTML =
        `<span class="city_badge" data-field="city">${city}</span>`;
    tr.querySelector('[data-field="transport"]').outerHTML =
        `<span class="pv" data-field="transport">${Number(transport).toLocaleString('en-US')}</span>`;
    tr.querySelector('td:last-child').innerHTML =
        `<button class="edit_btn" onclick="startEdit(this)">تعديل</button>`;
}

function fmtInp(input) {
    const oldVal             = input.value;
    const cursorPos          = input.selectionStart;
    const digitsBeforeCursor = oldVal.slice(0, cursorPos).replace(/[^0-9]/g, '').length;

    const raw    = oldVal.replace(/[^0-9]/g, '');
    const newVal = raw === '' ? '' : Number(raw).toLocaleString('en-US');
    input.value  = newVal;

    // Restore cursor: advance through newVal until we've passed the same digit count
    let digits = 0;
    let newPos = newVal.length;
    if (digitsBeforeCursor === 0) {
        newPos = 0;
    } else {
        for (let i = 0; i < newVal.length; i++) {
            if (/[0-9]/.test(newVal[i])) digits++;
            if (digits === digitsBeforeCursor) { newPos = i + 1; break; }
        }
    }
    input.setSelectionRange(newPos, newPos);
}

async function saveRow(btn) {
    const tr = btn.closest('tr');
    const id = tr.dataset.id;
    const transportInput = tr.querySelector('[data-field="transport"]');

    const cityInput    = tr.querySelector('[data-field="city"]');
    const cityVal      = cityInput ? cityInput.value.trim() : null;
    const transportVal = parseInt(transportInput.value.replace(/,/g, '')) || 0;

    const cancelBtn = tr.querySelector('.cancel_btn_dash');
    btn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    const updatePayload = {
        transport_price_per_day: transportVal,
        updated_at: new Date().toISOString()
    };
    if (cityVal) updatePayload.city = cityVal;

    const { error } = await db.from('package_prices')
        .update(updatePayload)
        .eq('id', id);

    if (error) {
        showStatus('خطأ في الحفظ: ' + error.message, 'error');
        btn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
    } else {
        showStatus('✓ تم الحفظ بنجاح', 'success');
        _revertRowToView(tr, cityVal || tr.dataset.origCity || '', transportVal);
    }
}

function showStatus(msg, type) {
    const el = document.getElementById('status_msg');
    el.textContent = msg;
    el.className = 'status_msg ' + type + ' visible';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
        el.classList.remove('visible');
        setTimeout(() => { el.textContent = ''; el.className = 'status_msg'; }, 260);
    }, 3200);
}

async function loadSettings() {
    const { data, error } = await db.from('package_settings').select('*');
    if (error || !data) return;
    data.forEach(row => {
        if (row.key === 'exchange_rate') {
            const inp = document.getElementById('exchange_rate_input');
            if (inp) inp.value = Number(row.value).toLocaleString('en-US');
        }
        if (row.key === 'sim_card_price_bali') {
            const inp = document.getElementById('sim_price_bali_input');
            if (inp) inp.value = Number(row.value).toLocaleString('en-US');
        }
        if (row.key === 'sim_card_price_jakarta') {
            const inp = document.getElementById('sim_price_jakarta_input');
            if (inp) inp.value = Number(row.value).toLocaleString('en-US');
        }
    });
}

async function saveSettings() {
    const rateRaw     = document.getElementById('exchange_rate_input').value.replace(/,/g, '');
    const simBaliRaw  = document.getElementById('sim_price_bali_input').value.replace(/,/g, '');
    const simJktRaw   = document.getElementById('sim_price_jakarta_input').value.replace(/,/g, '');
    const rateVal     = parseInt(rateRaw)    || 0;
    const simBaliVal  = parseInt(simBaliRaw) || 0;
    const simJktVal   = parseInt(simJktRaw)  || 0;

    const statusEl = document.getElementById('settings_status');

    const { error } = await db.from('package_settings').upsert([
        { key: 'exchange_rate',         value: String(rateVal),   updated_at: new Date().toISOString() },
        { key: 'sim_card_price_bali',   value: String(simBaliVal), updated_at: new Date().toISOString() },
        { key: 'sim_card_price_jakarta', value: String(simJktVal), updated_at: new Date().toISOString() }
    ]);

    if (error) {
        statusEl.textContent = 'خطأ في الحفظ: ' + error.message;
        statusEl.className = 'settings_status error';
    } else {
        statusEl.textContent = '✓ تم الحفظ';
        statusEl.className = 'settings_status success';
        setTimeout(() => { statusEl.textContent = ''; statusEl.className = 'settings_status'; }, 3000);
    }
}
