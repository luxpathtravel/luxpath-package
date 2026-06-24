/* ═══════════════════════════════════════════════════
   Package Price Table — Main Page Integration
   Auto-builds on hotel add/remove/date/price changes.
   ═══════════════════════════════════════════════════ */

// ─── Auto-trigger setup ───────────────────────────────
(function _initPptAutoTrigger() {
    let _timer = null;

    function _scheduleBuild() {
        clearTimeout(_timer);
        _timer = setTimeout(() => {
            buildPriceTable();
        }, 600);
    }

    document.addEventListener('DOMContentLoaded', () => {
        const hotelContainer = document.getElementById('inserted_hotel_data_position_div');
        if (hotelContainer) {
            new MutationObserver(_scheduleBuild).observe(hotelContainer, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-safe-side-price', 'data-safe-side-price2']
            });
        }
        // Note: client/passenger data no longer auto-rebuilds the table.
        // SIM + domestic-flight prices refresh only via pptRefreshFromClintData()
        // (called by createWholePackageAndClintDataFunction).
    });
})();

// Explicit refresh of SIM + domestic-flight prices, triggered when the client/passenger
// data is (re)submitted. Forces the domestic-flight input to recompute by clearing the
// last-flight signature, then rebuilds the table (no hotels required).
function pptRefreshFromClintData() {
    window._pptLastFlightSig = null; // force the domestic-flight auto-fill to run
    buildPriceTable();
}

// ─── Main builder ────────────────────────────────────
async function buildPriceTable() {
    const tableDiv = document.getElementById('package_price_table_div');
    if (!tableDiv) return;

    tableDiv.innerHTML = '<p class="ppt_loading">جاري تحميل الأسعار...</p>';

    let attempts = 0;
    while ((!window.supabase || typeof window.supabase.from !== 'function') && attempts < 30) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
    }

    let pricesByCity = {};
    let exchangeRate = 4700;
    let simCardPriceBali = 0;
    let simCardPriceJakarta = 0;
    let domesticTicketPrice = 0;

    try {
        const [citiesRes, settingsRes] = await Promise.all([
            window.supabase.from('package_prices').select('*'),
            window.supabase.from('package_settings').select('*')
        ]);
        if (!citiesRes.error && citiesRes.data)
            citiesRes.data.forEach(p => { pricesByCity[p.city] = p; });
        if (!settingsRes.error && settingsRes.data)
            settingsRes.data.forEach(s => {
                if (s.key === 'exchange_rate') exchangeRate = parseInt(s.value) || 4700;
                if (s.key === 'sim_card_price_bali') simCardPriceBali = parseInt(s.value) || 0;
                if (s.key === 'sim_card_price_jakarta') simCardPriceJakarta = parseInt(s.value) || 0;
                if (s.key === 'domestic_flight_ticket_price') domesticTicketPrice = parseInt(s.value) || 0;
            });
    } catch (e) {
        console.warn('Could not fetch package prices/settings:', e);
    }

    window._pptSettings = { exchangeRate, simCardPriceBali, simCardPriceJakarta, domesticTicketPrice };

    const hotelRows = [...document.querySelectorAll(
        '#inserted_hotel_data_position_div .hotel_row_class_for_editing'
    )];

    const passengersText = document.querySelector('#inserted_clint_data_position_div .clint_data_row_class_for_editing div:first-child p')?.innerText || '';
    const { adults: adultsCount, children: childrenCount, infants: infantsCount } = _pptParsePassengers(passengersText);

    const rows = [];

    // 1. Hotel rows (combine safeSidePrice + safeSidePrice2)
    hotelRows.forEach(hotelRow => {
        const name = hotelRow.querySelector('h1')?.innerText?.trim() || 'فندق';
        const nightsTx = hotelRow.querySelector('h4')?.innerText || '';
        const nights = parseInt(nightsTx.replace(/[^0-9]/g, '')) || 0;
        const raw1 = parseInt(hotelRow.dataset.safeSidePrice || '') || 0;
        const raw2 = parseInt(hotelRow.dataset.safeSidePrice2 || '') || 0;
        const rawPrice = (raw1 + raw2) > 0 ? (raw1 + raw2) : null;

        rows.push({ type: 'hotel', label: name, badge: `${nights} ليلة`, price: rawPrice, deletable: false });
    });

    // 2. Transport rows per city (nights + 1 days)
    const cityNights = {};
    hotelRows.forEach(hotelRow => {
        const city = hotelRow.querySelector('h5')?.innerText?.trim() || '';
        const nightTx = hotelRow.querySelector('h4')?.innerText || '';
        const nights = parseInt(nightTx.replace(/[^0-9]/g, '')) || 0;
        if (city && nights > 0) cityNights[city] = (cityNights[city] || 0) + nights;
    });

    Object.entries(cityNights).forEach(([city, nights]) => {
        const pd = pricesByCity[city];
        const perDay = pd ? parseInt(pd.transport_price_per_day) : 0;
        const days = nights + 1;
        const total = perDay * days;
        rows.push({
            type: 'transport',
            label: `مواصلات - ${city}`,
            calcNote: perDay > 0 ? `${days} × ${Number(perDay).toLocaleString('en-US')}` : '',
            price: total > 0 ? total : null,
            deletable: false
        });
    });

    // 3. SIM cards — Bali price if first hotel is in Bali, otherwise Jakarta price
    {
        const firstCity = hotelRows[0]?.querySelector('h5')?.innerText?.trim() || '';
        const isBali = firstCity.includes('بالي');
        const simCardPrice = isBali ? simCardPriceBali : simCardPriceJakarta;
        const simCityLabel = isBali ? 'بالي' : 'جاكرتا';
        const totalSim = simCardPrice * adultsCount;
        rows.push({
            type: 'sim',
            label: `شرائح إنترنت - ${simCityLabel}`,
            calcNote: (simCardPrice > 0 && adultsCount > 0)
                ? `${adultsCount} × ${Number(simCardPrice).toLocaleString('en-US')}` : '',
            price: totalSim > 0 ? totalSim : null,
            deletable: false
        });
    }

    // 4. Inner flights — auto-fill the editable domestic-flight input from passenger counts
    //    (adults + children = full ticket, each infant = 50%). Only overwrites when the
    //    passenger/ticket-price signature changes, so manual edits survive hotel-only rebuilds.
    _pptAutoFillDomesticFlight(adultsCount, childrenCount, infantsCount, domesticTicketPrice);
    const _domFlightRaw = document.getElementById('domestic_flight_price_input_id')?.value?.replace(/,/g, '') || '';
    const _domFlightPrice = parseInt(_domFlightRaw) || 0;
    rows.push({ type: 'inner_flight', label: 'طيران داخلي', price: _domFlightPrice > 0 ? _domFlightPrice : null, deletable: false });

    _renderPriceTable(tableDiv, rows);
    tableDiv.dataset.built = 'true';
}

// ─── Renderer ────────────────────────────────────────
function _renderPriceTable(tableDiv, rows) {
    const tbodyRows = rows.map((row, idx) => _buildRowHtml(row, idx)).join('');

    tableDiv.innerHTML = `
        <div class="ppt_wrapper">
            <div class="ppt_header">
                <h3 class="ppt_title">تسعير البكج</h3>
                <button class="ppt_reset_btn" onclick="pptRequestReset(this)" title="إعادة تعيين">
                    <ion-icon name="refresh-outline"></ion-icon>
                    إعادة تعيين
                </button>
            </div>
            <table class="ppt_table">
                <thead>
                    <tr>
                        <th>الخدمة</th>
                        <th>السعر (IDR)</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="ppt_tbody">${tbodyRows}</tbody>
            </table>
            <div class="ppt_footer_actions">
                <button class="ppt_add_btn" onclick="pptAddCustomRow()">
                    <ion-icon name="add-circle-outline"></ion-icon>
                    إضافة خدمة
                </button>
                <button class="ppt_add_btn" id="ppt_add_outer_flight_btn" onclick="pptAddOuterFlight()">
                    <ion-icon name="airplane-outline"></ion-icon>
                    إضافة طيران دولي
                </button>
            </div>
            <div class="ppt_total_row">
                <div class="ppt_total_item">
                    <div class="ppt_total_line">
                        <span class="ppt_total_label">إجمالي روبية</span>
                        <span class="ppt_total_value" id="ppt_total_display">-</span>
                    </div>
                    <div class="ppt_profit_field">
                        <label class="ppt_profit_label" for="ppt_profit_input_id">الربح بالريال</label>
                        <input type="text" class="ppt_profit_input" id="ppt_profit_input_id" placeholder="0"
                               value="${window._pptProfitSar ? Number(window._pptProfitSar).toLocaleString('en-US') : ''}"
                               oninput="pptFmtInput(this); _recalcPriceTotal()">
                    </div>
                </div>
                <div class="ppt_total_item">
                    <div class="ppt_total_line">
                        <span class="ppt_total_label">إجمالي ريال سعودي</span>
                        <p id="package_total_price_p_id" class="ppt_sar_value">-</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    _recalcPriceTotal();
}

function _buildRowHtml(row, idx) {
    const priceHtml = row.price != null
        ? `<span class="ppt_price_value" data-raw="${row.price}">${Number(row.price).toLocaleString('en-US')}</span>`
        : `<span class="ppt_price_value ppt_no_price" data-raw="0">لايوجد سعر</span>`;

    const badgeHtml = row.badge ? `<span class="ppt_nights_badge">${row.badge}</span>` : '';
    const calcHtml = row.calcNote ? `<span class="ppt_calc_note">${row.calcNote}</span>` : '';

    const deleteBtn = row.deletable !== false
        ? `<button class="ppt_delete_btn" onclick="pptDeleteRow(this)" title="حذف">
               <ion-icon name="close-outline"></ion-icon>
           </button>` : '';

    return `
        <tr class="ppt_${row.type}_row ppt_data_row" data-type="${row.type}" data-idx="${idx}">
            <td class="ppt_label_cell">
                ${row.type === 'custom'
            ? `<input class="ppt_label_input" value="${row.label || ''}" placeholder="اسم الخدمة" dir="auto">`
            : (row.label + badgeHtml + calcHtml)
        }
            </td>
            <td class="ppt_price_cell">${priceHtml}</td>
            <td class="ppt_action_cell">
                <div class="ppt_action_btns">
                    <button class="ppt_edit_btn" onclick="pptRequestEdit(this)" title="تعديل">
                        <ion-icon name="create-outline"></ion-icon>
                    </button>
                    ${deleteBtn}
                </div>
            </td>
        </tr>
    `;
}

// ─── Edit / delete flow (floating confirm popover) ────
let _pptActiveEditRow = null;
let _pptConfirmAnchor = null;
let _pptPendingAction = null; // 'edit' | 'delete' | 'reset'

function pptRequestEdit(btn) {
    _pptActiveEditRow = btn.closest('tr');
    _pptPendingAction = 'edit';
    _pptShowConfirmPopover(btn, 'تأكيد التعديل؟');
}

function pptDeleteRow(btn) {
    _pptActiveEditRow = btn.closest('tr');
    _pptPendingAction = 'delete';
    _pptShowConfirmPopover(btn, 'تأكيد الحذف؟', true);
}

function pptRequestReset(btn) {
    _pptActiveEditRow = null;
    _pptPendingAction = 'reset';
    _pptShowConfirmPopover(btn, 'إعادة تعيين الجدول؟', true);
}

function _pptShowConfirmPopover(anchorBtn, text, danger) {
    _pptRemoveConfirmPopover();
    _pptConfirmAnchor = anchorBtn;

    const pop = document.createElement('div');
    pop.className = 'ppt_confirm_popover' + (danger ? ' ppt_confirm_danger' : '');
    pop.id = 'ppt_confirm_popover';
    pop.innerHTML = `
        <span class="ppt_confirm_popover_text">${text}</span>
        <div class="ppt_confirm_popover_btns">
            <button class="ppt_confirm_yes" onclick="pptConfirmPopoverAction()">نعم</button>
            <button class="ppt_confirm_no" onclick="_pptRemoveConfirmPopover()">لا</button>
        </div>
    `;
    pop.style.visibility = 'hidden';
    document.body.appendChild(pop);

    _pptPositionConfirmPopover();
    pop.style.visibility = '';

    requestAnimationFrame(() => pop.classList.add('visible'));

    // Defer so the opening click doesn't immediately dismiss it
    setTimeout(() => {
        document.addEventListener('click', _pptOutsideConfirmClick, true);
        document.addEventListener('keydown', _pptEscConfirm, true);
        window.addEventListener('scroll', _pptPositionConfirmPopover, true);
        window.addEventListener('resize', _pptPositionConfirmPopover);
    }, 0);
}

// Keep the popover glued to its anchor row (called on scroll / resize)
function _pptPositionConfirmPopover() {
    const pop = document.getElementById('ppt_confirm_popover');
    if (!pop || !_pptConfirmAnchor) return;
    const rect = _pptConfirmAnchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left + rect.width / 2 - popRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
    if (top + popRect.height > window.innerHeight - 8) {
        top = rect.top - popRect.height - 8; // flip above if no room below
    }
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
}

function _pptRemoveConfirmPopover() {
    document.removeEventListener('click', _pptOutsideConfirmClick, true);
    document.removeEventListener('keydown', _pptEscConfirm, true);
    window.removeEventListener('scroll', _pptPositionConfirmPopover, true);
    window.removeEventListener('resize', _pptPositionConfirmPopover);
    _pptConfirmAnchor = null;
    const pop = document.getElementById('ppt_confirm_popover');
    if (!pop) return;
    pop.classList.remove('visible');
    setTimeout(() => pop.remove(), 200);
}

function _pptOutsideConfirmClick(e) {
    const pop = document.getElementById('ppt_confirm_popover');
    if (pop && !pop.contains(e.target)) _pptRemoveConfirmPopover();
}

function _pptEscConfirm(e) {
    if (e.key === 'Escape') _pptRemoveConfirmPopover();
}

function pptConfirmPopoverAction() {
    const tr = _pptActiveEditRow;
    const action = _pptPendingAction;
    _pptRemoveConfirmPopover();
    if (action === 'reset') { _pptPerformReset(); return; }
    if (!tr) return;
    if (action === 'delete') _pptPerformDelete(tr);
    else if (action === 'edit') pptConfirmEdit(tr);
}

function _pptPerformReset() {
    window._pptProfitSar = 0;
    window._pptLastFlightSig = null;
    buildPriceTable();
}

function pptConfirmEdit(tr) {
    const priceCell = tr.querySelector('.ppt_price_cell');
    const priceSpan = priceCell.querySelector('.ppt_price_value');
    if (!priceSpan) return;

    const currentRaw = parseInt(priceSpan.dataset.raw) || 0;
    const displayVal = currentRaw > 0 ? Number(currentRaw).toLocaleString('en-US') : '';

    priceCell.innerHTML = `
        <input type="text" class="ppt_price_input"
               value="${displayVal}"
               placeholder="أدخل السعر"
               oninput="pptFmtInput(this)"
               onkeydown="if(event.key==='Enter') this.closest('tr').querySelector('.ppt_save_inline_btn').click()">
    `;
    const inp = priceCell.querySelector('input');
    inp.focus();
    inp.select();

    const actionCell = tr.querySelector('.ppt_action_cell');
    actionCell.innerHTML = `
        <div class="ppt_inline_actions">
            <button class="ppt_save_inline_btn" onclick="pptSaveConfirmed(this)" title="حفظ">✅</button>
            <button class="ppt_cancel_inline_btn" onclick="pptCancelConfirmed(this)" data-orig="${currentRaw}" title="إلغاء">❌</button>
        </div>
    `;
}

function pptSaveConfirmed(saveBtn) {
    const tr = saveBtn.closest('tr');
    const priceCell = tr.querySelector('.ppt_price_cell');
    const inp = priceCell.querySelector('.ppt_price_input');
    if (!inp) return;

    const raw = inp.value.replace(/,/g, '');
    const numVal = parseInt(raw) || 0;

    const span = document.createElement('span');
    span.className = numVal > 0 ? 'ppt_price_value' : 'ppt_price_value ppt_no_price';
    span.dataset.raw = numVal;
    span.textContent = numVal > 0 ? `${Number(numVal).toLocaleString('en-US')}` : 'لايوجد سعر';
    priceCell.innerHTML = '';
    priceCell.appendChild(span);

    _restoreEditBtn(saveBtn.closest('.ppt_action_cell'), tr);
    _recalcPriceTotal();
}

function pptCancelConfirmed(cancelBtn) {
    const tr = cancelBtn.closest('tr');
    const priceCell = tr.querySelector('.ppt_price_cell');
    const origRaw = parseInt(cancelBtn.dataset.orig) || 0;

    const span = document.createElement('span');
    span.className = origRaw > 0 ? 'ppt_price_value' : 'ppt_price_value ppt_no_price';
    span.dataset.raw = origRaw;
    span.textContent = origRaw > 0 ? `${Number(origRaw).toLocaleString('en-US')}` : 'لايوجد سعر';
    priceCell.innerHTML = '';
    priceCell.appendChild(span);

    _restoreEditBtn(cancelBtn.closest('.ppt_action_cell'), tr);
    _recalcPriceTotal();
}

function _restoreEditBtn(actionCell, tr) {
    const isCustom = tr.classList.contains('ppt_custom_row') || tr.dataset.type === 'outer_flight';
    const deleteBtn = isCustom
        ? `<button class="ppt_delete_btn" onclick="pptDeleteRow(this)" title="حذف"><ion-icon name="close-outline"></ion-icon></button>`
        : '';
    actionCell.innerHTML = `
        <div class="ppt_action_btns">
            <button class="ppt_edit_btn" onclick="pptRequestEdit(this)" title="تعديل">
                <ion-icon name="create-outline"></ion-icon>
            </button>
            ${deleteBtn}
        </div>
    `;
}

function pptFmtInput(inp) {
    const oldVal = inp.value;
    const cursorPos = inp.selectionStart;
    const digitsBeforeCursor = oldVal.slice(0, cursorPos).replace(/[^0-9]/g, '').length;

    const raw = oldVal.replace(/[^0-9]/g, '');
    const newVal = raw === '' ? '' : Number(raw).toLocaleString('en-US');
    inp.value = newVal;

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
    inp.setSelectionRange(newPos, newPos);
}

// ─── Add rows ─────────────────────────────────────────
function pptAddOuterFlight() {
    _appendDynamicRow({ type: 'outer_flight', label: 'طيران دولي', deletable: true });
    _pptToggleOuterFlightBtn(false); // only one international-flight row allowed
}

// Smoothly hide/show the "إضافة طيران دولي" button
function _pptToggleOuterFlightBtn(show) {
    const btn = document.getElementById('ppt_add_outer_flight_btn');
    if (!btn) return;
    if (show) {
        btn.style.display = '';
        requestAnimationFrame(() => btn.classList.remove('ppt_btn_hidden'));
    } else {
        btn.classList.add('ppt_btn_hidden');
        setTimeout(() => {
            if (btn.classList.contains('ppt_btn_hidden')) btn.style.display = 'none';
        }, 220);
    }
}

function pptAddCustomRow() {
    const tbody = document.getElementById('ppt_tbody');
    if (!tbody) return;
    const idx = tbody.querySelectorAll('tr').length;
    tbody.insertAdjacentHTML('beforeend', `
        <tr class="ppt_custom_row ppt_data_row" data-type="custom" data-idx="${idx}">
            <td class="ppt_label_cell">
                <input class="ppt_label_input" value="" placeholder="اسم الخدمة" dir="auto"
                       onkeydown="if(event.key==='Enter'){this.closest('tr').querySelector('.ppt_save_inline_btn').click()} else if(event.key==='Escape'){this.closest('tr').querySelector('.ppt_cancel_inline_btn').click()}">
            </td>
            <td class="ppt_price_cell">
                <input class="ppt_price_input" value="" placeholder="السعر" oninput="pptFmtInput(this)"
                       onkeydown="if(event.key==='Enter'){this.closest('tr').querySelector('.ppt_save_inline_btn').click()} else if(event.key==='Escape'){this.closest('tr').querySelector('.ppt_cancel_inline_btn').click()}">
            </td>
            <td class="ppt_action_cell">
                <div class="ppt_inline_actions">
                    <button class="ppt_save_inline_btn" onclick="pptConfirmNewCustomRow(this)" title="تأكيد">✅</button>
                    <button class="ppt_cancel_inline_btn" onclick="pptCancelNewCustomRow(this)" title="إلغاء">❌</button>
                </div>
            </td>
        </tr>
    `);
    const input = tbody.lastElementChild?.querySelector('.ppt_label_input');
    if (input) input.focus();
}

// Confirm a freshly added custom row: lock in the name + price, swap to edit/delete buttons
function pptConfirmNewCustomRow(btn) {
    const tr = btn.closest('tr');
    const nameInput = tr.querySelector('.ppt_label_input');
    const priceInput = tr.querySelector('.ppt_price_input');
    const name = (nameInput?.value || '').trim();

    if (name === '') {
        nameInput.focus();
        nameInput.style.borderColor = '#d32f2f';
        setTimeout(() => { nameInput.style.borderColor = ''; }, 1200);
        return;
    }

    const numVal = parseInt((priceInput?.value || '').replace(/,/g, '')) || 0;

    // Lock in the name as plain text
    tr.querySelector('.ppt_label_cell').textContent = name;

    // Lock in the price as a value span
    const priceCell = tr.querySelector('.ppt_price_cell');
    const span = document.createElement('span');
    span.className = numVal > 0 ? 'ppt_price_value' : 'ppt_price_value ppt_no_price';
    span.dataset.raw = numVal;
    span.textContent = numVal > 0 ? Number(numVal).toLocaleString('en-US') : 'لايوجد سعر';
    priceCell.innerHTML = '';
    priceCell.appendChild(span);

    _restoreEditBtn(tr.querySelector('.ppt_action_cell'), tr);
    _recalcPriceTotal();
}

// Cancel a freshly added custom row: discard it entirely
function pptCancelNewCustomRow(btn) {
    btn.closest('tr').remove();
    _recalcPriceTotal();
}

function _appendDynamicRow(row) {
    const tbody = document.getElementById('ppt_tbody');
    if (!tbody) return;
    const idx = tbody.querySelectorAll('tr').length;
    tbody.insertAdjacentHTML('beforeend', _buildRowHtml({ ...row, price: null }, idx));
}

// ─── Delete row (after popover confirmation) ──────────
function _pptPerformDelete(tr) {
    const wasOuterFlight = tr.dataset.type === 'outer_flight';
    tr.remove();
    if (wasOuterFlight) _pptToggleOuterFlightBtn(true); // restore the add button
    _recalcPriceTotal();
}

// ─── Recalculate total ────────────────────────────────
function _recalcPriceTotal() {
    let total = 0;
    document.querySelectorAll('#ppt_tbody .ppt_price_value').forEach(el => {
        total += parseInt(el.dataset.raw) || 0;
    });

    const idrDisplay = document.getElementById('ppt_total_display');
    if (idrDisplay) idrDisplay.textContent = total > 0 ? `${Number(total).toLocaleString('en-US')} IDR` : '-';

    const exchangeRate = window._pptSettings?.exchangeRate || 4700;
    const sarBase = total > 0 ? Math.round(total / exchangeRate) : 0;

    // Profit (SAR) entered by the user, added on top of the converted package price
    const profitInput = document.getElementById('ppt_profit_input_id');
    const profit = profitInput ? (parseInt(profitInput.value.replace(/,/g, '')) || 0) : 0;
    window._pptProfitSar = profit; // persist across rebuilds

    const sarTotal = sarBase + profit;
    const sarDisplay = document.getElementById('package_total_price_p_id');
    if (sarDisplay) sarDisplay.textContent = sarTotal > 0 ? `${Number(sarTotal).toLocaleString('en-US')} SAR` : '-';
}

// ─── Passenger parsing ────────────────────────────────
// Reads strings like "2 بالغين" or "2 بالغين + 2 أطفال + 1 رضيع"
function _pptParsePassengers(txt) {
    let adults = 0, children = 0, infants = 0;
    (txt || '').split('+').forEach(seg => {
        const m = seg.match(/\d+/);
        if (!m) return;
        const n = parseInt(m[0]);
        if (seg.includes('رض')) infants += n; // رضيع / رضاع
        else if (seg.includes('طف')) children += n; // طفل / أطفال
        else if (seg.includes('بالغ')) adults += n; // بالغ / بالغين
    });
    return { adults, children, infants };
}

// Auto-fill the domestic-flight input: (adults + children) full ticket, each infant 50%.
// Skips when the passenger/price signature is unchanged so manual edits aren't clobbered.
function _pptAutoFillDomesticFlight(adults, children, infants, ticketPrice) {
    const input = document.getElementById('domestic_flight_price_input_id');
    if (!input) return;

    const signature = `${adults}|${children}|${infants}|${ticketPrice}`;
    if (window._pptLastFlightSig === signature) return;
    window._pptLastFlightSig = signature;

    const autoTotal = ticketPrice > 0
        ? Math.round((adults + children) * ticketPrice + infants * ticketPrice * 0.5)
        : 0;
    input.value = autoTotal > 0 ? Number(autoTotal).toLocaleString('en-US') : '';
}

// ─── Domestic flight price sync ───────────────────────
function updateDomesticFlightPrice() {
    const raw = document.getElementById('domestic_flight_price_input_id')?.value?.replace(/,/g, '') || '';
    const numVal = parseInt(raw) || 0;

    const row = document.querySelector('#ppt_tbody tr[data-type="inner_flight"]');
    if (!row) return;

    const span = row.querySelector('.ppt_price_value');
    if (!span) return;

    span.dataset.raw = numVal;
    span.className = numVal > 0 ? 'ppt_price_value' : 'ppt_price_value ppt_no_price';
    span.textContent = numVal > 0 ? `${Number(numVal).toLocaleString('en-US')}` : 'لايوجد سعر';

    _recalcPriceTotal();
}

// ─── Utility ──────────────────────────────────────────
function _escBacktick(str) {
    return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}
