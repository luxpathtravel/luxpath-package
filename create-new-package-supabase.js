let existingDataStatus = 'newData'; // Variable to identify if the data will be saved as a new data in the google sheet or as an existing data
let websiteUserUniqueNumber = 'newUniqueNumber'; // Variable to identify if the website user code number will be increased or no


/* Function to store the package in the Supabase database */
async function sendDataToSupabase() {
    return new Promise(async (resolve, reject) => {
        try {

            // 🔹 REQUIRED: Ensure `formattedName` is defined
            const formattedName = document.getElementById("package_user_code_name_for_later_import_reference_p_id")?.innerText.trim();


            // Capture the package as pure structured data (no HTML) — see serializePackage()
            const package_data = serializePackage();

            // Current timestamp
            const package_indo_user_current_date = new Date().toISOString();

            const rowData = {
                name: formattedName,
                package_data,
                package_indo_user_current_date
            };

            if (existingDataStatus === "newData") {
                const { data, error } = await supabase
                    .from('indo_all_package')
                    .insert([rowData])
                    .select();

                if (error) {
                    console.error("❌ Insert failed:", error);
                    reject(error);
                    return;
                }

            } else if (existingDataStatus === "existingData") {
                const { data, error } = await supabase
                    .from('indo_all_package')
                    .update(rowData)
                    .eq('name', formattedName)
                    .select();

                if (error) {
                    console.error("❌ Update failed:", error);
                    reject(error);
                    return;
                }

                if (data.length === 0) {
                    console.warn("⚠️ No row updated. Name might not exist:", formattedName);
                    reject("No matching row found to update.");
                    return;
                }

            } else {
                console.error("❌ Invalid existingDataStatus value:", existingDataStatus);
                reject("Invalid existingDataStatus value.");
                return;
            }



            updateDataBaseSavedDataNames();

            existingDataStatus = 'existingData';
            document.getElementById('website_users_name_input_id').disabled = true;
            websiteUserUniqueNumber = 'existingUniqueNumber';

            document.getElementById('use_website_user_code_name_as_downloaded_pdf_file_name_p_id').style.pointerEvents = 'auto';



            resolve();
        } catch (error) {
            console.error("❌ Unexpected error in sendDataToSupabase:", error);
            reject(error);
        }
    });
}










/* ════════════════════════════════════════════════════════════════════════════
   STRUCTURED PACKAGE DATA  (serialize ⇄ render)

   Packages are stored in `indo_all_package.package_data` (jsonb) as pure DATA —
   no HTML at all. On import we rebuild ONLY the dynamic parts of each PDF section
   from that data; the static section skeletons (arch hero, skyline SVG, table
   headers, the hidden `store_google_sheet_*` markers) stay in index.html, so a
   package always re-renders with the CURRENT markup — changing an element no
   longer leaves stale HTML frozen in the database.

   ⚠ The row shapes produced by the _render* helpers MIRROR the builder templates
   in create-new-package-insert-data.js (createHotelsDataFunction,
   createAllFlightDataFunction/editClickedFlightData, autoCreateALlClintMovementsData,
   createWholePackageAndClintDataFunction). If you change a row's markup in one of
   those builders, mirror the change in the matching _render* helper here.
   ════════════════════════════════════════════════════════════════════════════ */

const PACKAGE_DATA_VERSION = 1;

/* All hidden `store_google_sheet_*` markers, keyed by a short name. These hold the
   scalar package fields and are read back by reActiveDragAndDropFunctionality() to
   restore inputs/checkboxes — so we just round-trip their text. */
const _PKG_MARKERS = {
    clintName: 'store_google_sheet_clint_name_value',
    clintCode: 'store_google_sheet_package_clint_code_number_value',
    adults: 'store_google_sheet_package_adult_amount_value',
    kids: 'store_google_sheet_package_kids_amount_value',
    infant: 'store_google_sheet_package_infant_amount_value',
    firstDate: 'store_google_sheet_whole_package_first_date_value',
    lastDate: 'store_google_sheet_whole_package_last_date_value',
    nights: 'store_google_sheet_whole_package_total_nights_value',
    company: 'store_google_sheet_clint_company_name_value',
    user: 'store_google_sheet_package_user_name_value',
    priceType: 'store_google_sheet_clint_package_price_type_checkbox_value',
    packageType: 'store_google_sheet_clint_package_type_checkbox_value',
    rawCode: 'store_google_sheet_package_raw_user_with_no_riv_for_later_reference_when_importing',
    datesHidden: 'store_google_sheet_all_package_dates_hidden_or_no',
    flightUid: 'store_google_sheet_flight_uniuqe_id_name_value',
    hotelUid: 'store_google_sheet_hotel_uniuqe_id_name_value',
    hotelLastCheckout: 'store_google_sheet_hotel_last_stopped_check_out_date_value',
    sms: 'store_google_sheet_package_including_sms_value',
    innerTickets: 'store_google_sheet_package_including_inner_tickets_value',
    details: 'store_google_sheet_package_details_textarea_value',
    carType: 'store_google_sheet_package_specific_car_type_value',
    totalPrice: 'store_google_sheet_package_total_price_value',
};

function _pkgText(id) { const el = document.getElementById(id); return el ? el.innerText : ''; }
function _pkgSetText(id, val) { const el = document.getElementById(id); if (el) el.innerText = (val == null ? '' : val); }


/* ── SERIALIZE ─────────────────────────────────────────────────────────────── */

function serializePackage() {
    const markers = {};
    for (const k in _PKG_MARKERS) markers[k] = _pkgText(_PKG_MARKERS[k]);

    // The three checkbox-state divs each list the checkbox ids (one per <p>)
    const readIds = divId => Array.from(
        document.getElementById(divId)?.querySelectorAll('p') || []
    ).map(p => p.innerText).filter(Boolean);

    return {
        version: PACKAGE_DATA_VERSION,
        markers,
        packageCode: _pkgText('package_user_code_name_for_later_import_reference_p_id'),
        clintCodeHasValue: document.getElementById('package_clint_code_number_p_id')?.getAttribute('data-has-value') || 'false',
        checkboxColors: {
            green: readIds('store_google_sheet_green_checked_package_including_and_not_including_input_div'),
            red: readIds('store_google_sheet_red_checked_package_including_and_not_including_input_div'),
            white: readIds('store_google_sheet_white_package_including_and_not_including_input_div'),
        },
        showPriceInPdf: !!document.getElementById('show_package_total_price_checkbox')?.checked,
        totalPricePdf: _pkgText('package_total_price_pdf_p_id'),
        hotels: _serializeHotels(),
        flights: _serializeFlights(),
        movements: _serializeMovements(),
    };
}

/* Reads each hotel row using the same sub-element id patterns as editClickedHotelDataFunction */
function _serializeHotels() {
    const rows = document.querySelectorAll('#inserted_hotel_data_position_div .hotel_row_class_for_editing');
    return Array.from(rows).map(row => {
        const uid = row.id.split('_').pop();
        const txt = sel => (row.querySelector(sel)?.innerText ?? '');
        const urlCell = row.querySelector('.hotel-row-url-cell');
        const lastImg = row.querySelector('div:last-child img');
        const hotel = {
            uid,
            isWriting: row.classList.contains('new_hotel_data_by_user_writing_class'),
            name: txt(`h1[id^='hotel_name_${uid}']`),
            checkIn: txt(`h2[id^='hotel_check_in_${uid}']`),
            checkOut: txt(`h3[id^='hotel_check_out_${uid}']`),
            nights: txt(`h4[id^='hotel_total_nights_${uid}']`),
            location: txt(`h5[id^='hotel_location_${uid}']`),
            area: txt(`h6[id^='hotel_area_${uid}']`),
            imageSrc: lastImg ? lastImg.getAttribute('src') : '',
            room1: {
                ar: txt(`span[id^='hotel_room_arabic_type_description_${uid}']`),
                en: txt(`span[id^='hotel_room_type_description_${uid}']`),
                units: txt(`p[id^='hotel_total_unit_${uid}']`),
                breakfast: txt(`span[id^='hotel_breakfast_span_id_${uid}']`),
                extraBed: txt(`span[id^='hotel_extra_bed_span_id_${uid}']`),
                special: txt(`span[id^='hotel_special_request_span_id_${uid}']`),
                extraInfo: txt(`span[id^='hotel_extra_info_span_id_${uid}']`),
            },
            safeSidePrice: row.dataset.safeSidePrice || '',
            safeSidePrice2: row.dataset.safeSidePrice2 || '',
            urlCell: urlCell ? {
                hotelName: urlCell.getAttribute('data-hotel-name') || '',
                roomTypeEn: urlCell.getAttribute('data-room-type-en') || '',
                isNewWriting: urlCell.getAttribute('data-is-new-writing') || '',
                url: urlCell.getAttribute('data-url') || '',
            } : null,
        };
        // Second room exists only when its room-type span is present
        if (row.querySelector(`span[id^='hotel_room_type_description_2_${uid}']`)) {
            hotel.room2 = {
                ar: txt(`span[id^='hotel_room_arabic_type_description_2_${uid}']`),
                en: txt(`span[id^='hotel_room_type_description_2_${uid}']`),
                units: txt(`p[id^='hotel_total_unit_2_${uid}']`),
                breakfast: txt(`span[id^='hotel_breakfast_span_id_2_${uid}']`),
                extraBed: txt(`span[id^='hotel_extra_bed_span_id_2_${uid}']`),
                special: txt(`span[id^='hotel_special_request_span_id_2_${uid}']`),
                extraInfo: txt(`span[id^='hotel_extra_info_span_id_2_${uid}']`),
            };
        }
        return hotel;
    });
}

/* Reads each flight row using the same sub-element id patterns as editClickedFlightData */
function _serializeFlights() {
    const rows = document.querySelectorAll('#inserted_flight_data_position_div .flight_row_class_for_editing');
    return Array.from(rows).map(row => {
        const uid = row.id.split('_').pop();
        const txt = sel => (row.querySelector(sel)?.innerText ?? '');
        return {
            uid,
            airline: txt(`p[id^='flight_air_line_${uid}']`),
            adult: txt(`p[id^='flight_adult_person_amount_${uid}']`),
            infant: txt(`p[id^='flight_infant_person_amount_${uid}']`),
            extraBags: txt(`p[id^='flight_extra_bags_${uid}']`),
            fromCity: txt(`h2[id^='flight_from_city_${uid}']`),
            toCity: txt(`h3[id^='flight_to_city_${uid}']`),
            date: txt(`h1[id^='flight_date_${uid}']`),
        };
    });
}

/* Every movement row (auto / manual / free-transport / split) shares one 3-cell shape */
function _serializeMovements() {
    const rows = document.querySelectorAll('#inserted_clint_movements_data_position_div .clint_movements_row_class_for_editing');
    return Array.from(rows).map(row => ({
        date: row.querySelector('h1')?.innerText ?? '',
        details: row.querySelector('h2')?.innerText ?? '',
        city: row.querySelector('h3')?.innerText ?? '',
    }));
}


/* ── RENDER ────────────────────────────────────────────────────────────────── */

function renderPackageFromData(d) {
    if (!d || typeof d !== 'object') return;

    // 1. Clear the dynamic row containers (static skeletons stay)
    ['inserted_hotel_data_position_div', 'inserted_flight_data_position_div', 'inserted_clint_movements_data_position_div']
        .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });

    // 2. Client section: set every scalar marker, then rebuild the visible client DOM
    const m = d.markers || {};
    for (const k in _PKG_MARKERS) _pkgSetText(_PKG_MARKERS[k], m[k] || '');
    _renderClientSection(d);

    // 3. Inclusion checkbox-state divs (green/red/white lists of checkbox ids)
    const setColorDiv = (divId, ids) => {
        const el = document.getElementById(divId); if (!el) return;
        el.innerHTML = '';
        (ids || []).forEach(cid => { const p = document.createElement('p'); p.innerText = cid; el.appendChild(p); });
    };
    setColorDiv('store_google_sheet_green_checked_package_including_and_not_including_input_div', d.checkboxColors && d.checkboxColors.green);
    setColorDiv('store_google_sheet_red_checked_package_including_and_not_including_input_div', d.checkboxColors && d.checkboxColors.red);
    setColorDiv('store_google_sheet_white_package_including_and_not_including_input_div', d.checkboxColors && d.checkboxColors.white);

    // 4-6. Hotels / flights / movements rows
    const hotelPos = document.getElementById('inserted_hotel_data_position_div');
    (d.hotels || []).forEach(h => hotelPos.appendChild(_renderHotelRow(h)));
    document.getElementById('downloaded_pdf_hotel_data_page').style.display = (d.hotels && d.hotels.length) ? 'block' : 'none';

    const flightPos = document.getElementById('inserted_flight_data_position_div');
    (d.flights || []).forEach(f => flightPos.appendChild(_renderFlightRow(f)));
    document.getElementById('downloaded_pdf_flight_data_page').style.display = (d.flights && d.flights.length) ? 'block' : 'none';

    const movePos = document.getElementById('inserted_clint_movements_data_position_div');
    (d.movements || []).forEach(mv => movePos.appendChild(_renderMovementRow(mv)));
    document.getElementById('downloaded_pdf_clint_movements_data_page').style.display = (d.movements && d.movements.length) ? 'block' : 'none';

    // 7. Re-wire every section (restores inputs from markers, drag-drop, controllers, checkbox colors)
    ['downloaded_pdf_clint_data_page', 'downloaded_pdf_hotel_data_page', 'downloaded_pdf_flight_data_page',
        'downloaded_pdf_clint_movements_data_page', 'downloaded_pdf_package_including_data_page'].forEach(sec => {
            try { reActiveDragAndDropFunctionality(sec); } catch (e) { console.warn('re-wire failed for', sec, e); }
        });

    // 8. Inclusion cards: regenerate from the restored checkbox colors + inputs (price-guard bypassed)
    _rebuildInclusionsAndPrice(d);
}

/* Rebuilds the client/cover dynamic DOM from the scalar markers (mirrors createWholePackageAndClintDataFunction) */
function _renderClientSection(d) {
    const m = d.markers || {};

    _pkgSetText('package_user_code_name_for_later_import_reference_p_id', d.packageCode || '');

    const codeP = document.getElementById('package_clint_code_number_p_id');
    if (codeP) { codeP.innerText = m.clintCode || ''; codeP.setAttribute('data-has-value', d.clintCodeHasValue || 'false'); }

    // Package-type badge + emoji. NB: the marker stores the legacy spelling "بكج شهل عسل".
    const typeMap = {
        'بكج شهل عسل': { label: 'بكج شهر عسل', emoji: '👩🏻‍❤️‍👨🏻' },
        'بكج شباب': { label: 'بكج شباب', emoji: '🤵🏻‍♂️' },
        'بكج عائلة': { label: 'بكج عائلة', emoji: '👨‍👩‍👧‍👦' },
        'بكج شخصين': { label: 'بكج شخصين', emoji: '💫' },
        'بكج قروب': { label: 'بكج قروب', emoji: '🤩' },
    };
    const t = typeMap[m.packageType] || { label: 'بكج جديد', emoji: '✨' };
    const typeH6 = document.getElementById('clint_package_type_h6');
    if (typeH6) typeH6.innerHTML = t.label;
    const emojiP = document.getElementById('package_emoji_p_id');
    if (emojiP) emojiP.innerText = t.emoji;

    const priceH6 = document.getElementById('package_price_type_h6_id');
    if (priceH6) {
        if (m.priceType) { priceH6.innerHTML = `  (${m.priceType})`; priceH6.style.display = 'block'; }
        else { priceH6.innerText = ''; priceH6.style.display = 'none'; }
    }

    const nameP = document.getElementById('clint_full_name_p');
    const titleDiv = document.getElementById('pdf_clint_info_section_title_div_id');
    if (nameP) {
        if (m.clintName) {
            nameP.innerText = `الأستاذ/ة : ${m.clintName}`;
            nameP.style.display = 'block';
            if (titleDiv) titleDiv.style.borderBottom = '0.5px solid black';
        } else {
            nameP.innerText = '';
            nameP.style.display = 'none';
            if (titleDiv) titleDiv.style.borderBottom = 'none';
        }
    }

    // Welcome hero image + company logo (logo onclick is re-wired by reActiveDragAndDropFunctionality)
    const welcomeImg = document.getElementById('welcome_pdf_first_page_image_id');
    const logoPos = document.getElementById('inserted_company_name_image_position_div');
    const existingLogo = document.getElementById('inserted_company_name_logo_id');
    if (existingLogo) existingLogo.remove();
    if (m.company) {
        const dash = m.company.replace(/\s+/g, '-');
        if (welcomeImg) welcomeImg.src = `خلفية-الشركات/${dash}.jpg`;
        if (logoPos) {
            const logo = document.createElement('img');
            logo.src = `خلفية-الشركات/${dash}.jpg`;
            logo.className = 'inserted_company_name_logo';
            logo.id = 'inserted_company_name_logo_id';
            logoPos.appendChild(logo);
        }
    } else if (welcomeImg) {
        welcomeImg.src = 'first-pdf-image.jpg';
    }

    // Combined persons + dates + nights row
    let combined = m.adults || '';
    if (m.kids) combined += ` + ${m.kids}`;
    if (m.infant) combined += ` ${m.infant}`;
    const dataPos = document.getElementById('inserted_clint_data_position_div');
    if (dataPos) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'clint_data_row_class clint_data_row_class_for_editing';
        rowDiv.innerHTML =
            `<div><p></p></div>` +
            `<div><p id="whole_package_first_date_p_id"></p></div>` +
            `<div><p id="whole_package_last_date_p_id"></p></div>` +
            `<div><p></p></div>`;
        const ps = rowDiv.querySelectorAll('p');
        ps[0].innerText = combined;
        ps[1].innerText = m.firstDate || '';
        ps[2].innerText = m.lastDate || '';
        ps[3].innerText = m.nights || '';
        dataPos.innerHTML = '';
        dataPos.appendChild(rowDiv);
    }
    const headerRow = document.getElementById('clint_data_row_main_div_id');
    if (headerRow) headerRow.style.display = 'flex';

    document.getElementById('downloaded_pdf_clint_data_page').style.display = 'block';
}

/* Builds one hotel row identical to createHotelsDataFunction's output */
function _renderHotelRow(h) {
    const uid = h.uid;
    const div = document.createElement('div');
    div.id = `hotel_row_id_${uid}`;
    div.className = h.isWriting
        ? 'hotel_row_class hotel_row_class_for_editing new_hotel_data_by_user_writing_class'
        : 'hotel_row_class hotel_row_class_for_editing';
    if (h.safeSidePrice) div.dataset.safeSidePrice = h.safeSidePrice;
    if (h.safeSidePrice2) div.dataset.safeSidePrice2 = h.safeSidePrice2;

    const room2 = h.room2;
    const r1 = h.room1 || {};
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    let urlAttrs = 'class="hotel-row-url-cell"';
    if (h.urlCell) {
        urlAttrs = `class="hotel-row-url-cell" data-hotel-name="${esc(h.urlCell.hotelName)}" data-room-type-en="${esc(h.urlCell.roomTypeEn)}" data-is-new-writing="${esc(h.urlCell.isNewWriting)}"` +
            (h.urlCell.url ? ` data-url="${esc(h.urlCell.url)}"` : '');
    }
    const imgId = h.isWriting ? ` id='hotel_image_${uid}'` : '';
    const unitCell =
        `<p id='hotel_total_unit_${uid}'></p>` +
        (room2 ? `<p style="width: 100%; background: rgb(5, 17, 21); color: white">+ </p><p id="hotel_total_unit_2_${uid}" style="width: 100%; background: rgb(5, 17, 21); color: white"></p>` : '');

    div.innerHTML =
        `<div><h1 id='hotel_name_${uid}'></h1></div>` +
        `<div><h2 id='hotel_check_in_${uid}' class="hotel_check_in_date_for_matching_whole_package_date"></h2></div>` +
        `<div><h3 style="color: red" id='hotel_check_out_${uid}' class="hotel_check_out_date_for_matching_whole_package_date"></h3></div>` +
        `<div><h4 id='hotel_total_nights_${uid}'></h4></div>` +
        `<div class="description_cell"><span id='hotel_room_arabic_type_description_${uid}'></span><span id='hotel_room_type_description_${uid}'></span></div>` +
        `<div>${unitCell}</div>` +
        `<div ${urlAttrs}><h5 id='hotel_location_${uid}'></h5>${h.area ? `<br><h6 id='hotel_area_${uid}'></h6>` : ''}<img src="${esc(h.imageSrc)}"${imgId} class="hotel_row_image_controller inserted_hotel_data_row" style="cursor: pointer"></div>`;

    // Fill text via innerText (so hotel/room names with special chars can't break markup)
    const setText = (sel, v) => { const e = div.querySelector(sel); if (e) e.innerText = (v == null ? '' : v); };
    setText(`#hotel_name_${uid}`, h.name);
    setText(`#hotel_check_in_${uid}`, h.checkIn);
    setText(`#hotel_check_out_${uid}`, h.checkOut);
    setText(`#hotel_total_nights_${uid}`, h.nights);
    setText(`#hotel_room_arabic_type_description_${uid}`, r1.ar);
    setText(`#hotel_room_type_description_${uid}`, r1.en);
    setText(`#hotel_total_unit_${uid}`, r1.units);
    setText(`#hotel_location_${uid}`, h.location);
    if (h.area) setText(`#hotel_area_${uid}`, h.area);
    if (room2) setText(`#hotel_total_unit_2_${uid}`, room2.units);

    // Optional description spans — same insert/append order & styling as the builder
    const descCell = div.querySelector('.description_cell');
    const enSpan = div.querySelector(`#hotel_room_type_description_${uid}`);
    const mkSpan = (id, text, css, cls) => {
        const s = document.createElement('span');
        if (id) s.id = id;
        if (cls) s.className = cls;
        if (css) s.style.cssText = css;
        s.innerText = text;
        return s;
    };
    const dark = 'background: rgb(85, 127, 137); color: white; padding: 0 5px';
    if (r1.breakfast) descCell.insertBefore(mkSpan(`hotel_breakfast_span_id_${uid}`, r1.breakfast), enSpan);
    if (r1.extraBed) descCell.appendChild(mkSpan(`hotel_extra_bed_span_id_${uid}`, r1.extraBed, 'width: 100%; ' + dark, 'hotel_special_request_span_class'));
    if (r1.special) descCell.appendChild(mkSpan(`hotel_special_request_span_id_${uid}`, r1.special, dark, 'hotel_special_request_span_class'));
    if (r1.extraInfo) descCell.appendChild(mkSpan(`hotel_extra_info_span_id_${uid}`, r1.extraInfo, 'width: 100%; ' + dark));

    if (room2) {
        const darker = 'background: rgb(5, 17, 21); color: white';
        const en2 = mkSpan(`hotel_room_type_description_2_${uid}`, room2.en, 'width: 100%; ' + darker);
        if (room2.ar) {
            descCell.appendChild(mkSpan('', '+ ', 'width: 100%; ' + darker));
            descCell.appendChild(mkSpan(`hotel_room_arabic_type_description_2_${uid}`, room2.ar, 'width: 100%; ' + darker));
        }
        if (room2.breakfast) descCell.appendChild(mkSpan(`hotel_breakfast_span_id_2_${uid}`, room2.breakfast, 'width: 100%; ' + darker));
        descCell.appendChild(en2);
        if (room2.extraBed) descCell.appendChild(mkSpan(`hotel_extra_bed_span_id_2_${uid}`, room2.extraBed, 'width: 100%; ' + darker + '; padding: 0 5px', 'hotel_special_request_span_class'));
        if (room2.special) descCell.appendChild(mkSpan(`hotel_special_request_span_id_2_${uid}`, room2.special, 'width: 100%; ' + darker + '; padding: 0 5px', 'hotel_special_request_span_class'));
        if (room2.extraInfo) descCell.appendChild(mkSpan(`hotel_extra_info_span_id_2_${uid}`, room2.extraInfo, 'width: 100%; ' + darker + '; padding: 0 5px'));
    }

    return div;
}

/* Builds one flight row identical to editClickedFlightData's confirmed-row output */
function _renderFlightRow(f) {
    const uid = f.uid;
    const div = document.createElement('div');
    div.id = `flight_row_id_${uid}`;
    div.className = 'flight_row_class flight_row_class_for_editing';
    div.innerHTML =
        `<div class="flight_row_flight_arrival_time_controller inserted_flight_data_row" style="cursor: pointer;">${f.airline ? `<p id="flight_air_line_${uid}"></p>` : ''}</div>` +
        `<div><p id="flight_adult_person_amount_${uid}"></p>${f.infant ? `<p id="flight_infant_person_amount_${uid}"></p>` : ''}</div>` +
        `<div><p>20Kg للشخص</p>${f.extraBags ? `<p id="flight_extra_bags_${uid}"></p>` : ''}</div>` +
        `<div>${f.fromCity ? `<h2 id="flight_from_city_${uid}"></h2>` : ''}</div>` +
        `<div>${f.toCity ? `<h3 id="flight_to_city_${uid}"></h3>` : ''}</div>` +
        `<div>${f.date ? `<h1 id="flight_date_${uid}" class="flight_date_for_matching_whole_package_date"></h1>` : ''}</div>`;
    const set = (sel, v) => { const e = div.querySelector(sel); if (e) e.innerText = v; };
    if (f.airline) set(`#flight_air_line_${uid}`, f.airline);
    set(`#flight_adult_person_amount_${uid}`, f.adult);
    if (f.infant) set(`#flight_infant_person_amount_${uid}`, f.infant);
    if (f.extraBags) set(`#flight_extra_bags_${uid}`, f.extraBags);
    if (f.fromCity) set(`#flight_from_city_${uid}`, f.fromCity);
    if (f.toCity) set(`#flight_to_city_${uid}`, f.toCity);
    if (f.date) set(`#flight_date_${uid}`, f.date);
    return div;
}

/* Builds one movements row identical to autoCreateALlClintMovementsData's output */
function _renderMovementRow(mv) {
    const div = document.createElement('div');
    div.className = 'clint_movements_row_class clint_movements_row_class_for_editing';
    div.innerHTML =
        `<div><h1></h1></div>` +
        `<div><h2></h2></div>` +
        `<div class="clint_movements_row_controller" style="cursor: pointer;"><h3></h3></div>`;
    div.querySelector('h1').innerText = mv.date || '';
    div.querySelector('h2').innerText = mv.details || '';
    div.querySelector('h3').innerText = mv.city || '';
    return div;
}

/* Regenerates the inclusion/gift cards by re-running the real builder (checkbox colors + inputs
   were restored by reActiveDragAndDropFunctionality), then restores the saved PDF total price.
   window._pptImportBypass skips the builder's "price table not ready" guard during import. */
function _rebuildInclusionsAndPrice(d) {
    const cc = d.checkboxColors || {};
    try {
        window._pptImportBypass = true;
        if (typeof createAllPackageIncludingAndNotIncludingData === 'function' &&
            ((cc.green && cc.green.length) || (cc.red && cc.red.length))) {
            createAllPackageIncludingAndNotIncludingData();
        }
    } catch (e) {
        console.warn('inclusions rebuild failed', e);
    } finally {
        window._pptImportBypass = false;
    }

    // The builder recomputes the total from the live price table; restore the saved PDF value instead
    _pkgSetText('package_total_price_pdf_p_id', d.totalPricePdf || '');
    _pkgSetText('store_google_sheet_package_total_price_value', d.totalPricePdf || '');
    const showChk = document.getElementById('show_package_total_price_checkbox');
    if (showChk) showChk.checked = !!d.showPriceInPdf;
    const totalSec = document.getElementById('downloaded_pdf_total_price_data_page');
    if (totalSec) totalSec.style.display = (d.showPriceInPdf && (d.totalPricePdf || '').trim() !== '') ? 'block' : 'none';

    if (typeof ensureAllPackageDatesHiddenOrNo === 'function') {
        try { ensureAllPackageDatesHiddenOrNo(); } catch (e) { /* no-op */ }
    }
}






















/* Create object to store all the google sheet data for later use (when importing) */
let sheetData = [];

let totalRivPackageNumberForUpdatingNewRivPackage = null;

/* Objects to store the user packages away from each other */
let googleSheet_br_PackageNames = [];
let googleSheet_ad_PackageNames = [];
let googleSheet_rd_PackageNames = [];

/* Fetch ALL data from Supabase table - continues until all rows are fetched */
async function updateDataBaseSavedDataNames() {
    const allGoogleSheetStoredDataNamesForImportingDataDiv = document.getElementById('all_google_sheet_stored_data_names_for_importing_data_div');
    allGoogleSheetStoredDataNamesForImportingDataDiv.innerHTML = '';
    clearPackageNameArrays();

    // Collect all data first
    let allData = [];
    const batchSize = 1000; // Batch size for fetching (Supabase recommended max is 1000)
    let currentOffset = 0;
    let hasMoreData = true;


    // Continue fetching until no more data is returned
    while (hasMoreData) {
        try {
            const { data, error } = await supabase
                .from('indo_all_package')
                .select('name') // Only select the name column to reduce data transfer
                .order('package_indo_user_current_date', { ascending: false }) // Order by timestamp descending (newest first)
                .range(currentOffset, currentOffset + batchSize - 1);

            if (error) {
                console.error(`❌ Error fetching batch at offset ${currentOffset}:`, error);
                break;
            }

            // If no data returned, we've reached the end
            if (!data || data.length === 0) {
                hasMoreData = false;
                break;
            }

            // Collect all data from this batch
            allData = allData.concat(data);


            // If we got less than batchSize, we've reached the end
            if (data.length < batchSize) {
                hasMoreData = false;
            } else {
                // Move to the next batch
                currentOffset += batchSize;
            }

        } catch (error) {
            console.error(`❌ Exception fetching batch at offset ${currentOffset}:`, error);
            break;
        }
    }


    // Now process all data at once in the correct order (newest first)
    filterAndStorePackageNames(allData);

    // Call these functions only once after all data is processed
    hideAllH3Elements();
    enablePointerEventsForFilters();
    updateSearchFilterFunctionality();

    document.getElementById('import_packages_title_h6_id').innerText = `تم تحميل جميع البكجات`;
}


function clearPackageNameArrays() {
    let arrays = [
        googleSheet_br_PackageNames, googleSheet_ad_PackageNames, googleSheet_rd_PackageNames
    ];

    arrays.forEach(arr => arr.length = 0); // Clear each array
}

/* Show only the h3 elements that are matching the picked "user code" button */
function filterAndStorePackageNames(data) {
    const allGoogleSheetStoredDataNamesForImportingDataDiv = document.getElementById('all_google_sheet_stored_data_names_for_importing_data_div');

    data.forEach(row => {
        const packageName = row.name;

        if (!packageName) return; // Skip if name is missing

        // Avoid duplicate elements
        if (!document.getElementById(packageName)) {
            const h3Element = createH3Element(packageName);
            h3Element.id = packageName;

            // Sort package names into the correct arrays
            if (packageName.startsWith('br')) {
                googleSheet_br_PackageNames.push(h3Element);
            } else if (packageName.startsWith('ad')) {
                googleSheet_ad_PackageNames.push(h3Element);
            } else if (packageName.startsWith('rd')) {
                googleSheet_rd_PackageNames.push(h3Element);
            }

            // Insert element into the DOM - always append to maintain newest-first order
            allGoogleSheetStoredDataNamesForImportingDataDiv.append(h3Element);
        }
    });
}



// Function to hide all <h3> elements
function hideAllH3Elements() {
    let allH3Elements = document.getElementById('all_google_sheet_stored_data_names_for_importing_data_div').getElementsByTagName('h3');
    for (let i = 0; i < allH3Elements.length; i++) {
        allH3Elements[i].style.display = 'none';
    }
}

// Function to display filtered data based on input field value
let packageArrayMap = {
    'بكج بندر': googleSheet_br_PackageNames,
    'بكج احمد': googleSheet_ad_PackageNames,
    'بكج رايد': googleSheet_rd_PackageNames,
};

// Function to create h3 elements based on package names
function createH3Element(packageName) {
    let h3Element = document.createElement('h3');
    h3Element.innerText = packageName;

    // Check if the innerText is "Name" and hide the element if it is
    if (h3Element.innerText === "Name") {
        h3Element.remove();
    } else {
        h3Element.onclick = function () {
            pickThisGoogleSheetDataName(this);
        };

        // Store the h3 element in the appropriate array based on its innerText
        if (h3Element.innerText.startsWith('br')) {
            googleSheet_br_PackageNames.push(h3Element);
        } else if (h3Element.innerText.startsWith('ad')) {
            googleSheet_ad_PackageNames.push(h3Element);
        } else if (h3Element.innerText.startsWith('rd')) {
            googleSheet_rd_PackageNames.push(h3Element);
        }
    }

    return h3Element;
}

// Function to enable pointer events and opacity for all filter buttons
function enablePointerEventsForFilters() {

    let userNameInput = document.getElementById('website_users_name_input_id').value;


    let elements = document.getElementsByClassName('filter_google_sheet_packages_names_p_class');
    for (let i = 0; i < elements.length; i++) {
        elements[i].style.pointerEvents = 'auto';
        elements[i].style.opacity = '1';
        elements[i].style.backgroundColor = 'rgb(255, 174, 0)';
    }


    // Get all p elements with the class name 'filter_google_sheet_packages_names_p_class'
    let filterElements = document.getElementsByClassName('filter_google_sheet_packages_names_p_class');

    // Apply the background color based on the input value
    switch (userNameInput) {
        case 'بكج بندر':
            if (filterElements[0]) filterElements[0].style.backgroundColor = 'rgb(140, 0, 255)';
            targetArray = googleSheet_br_PackageNames;
            break;
        case 'بكج احمد':
            if (filterElements[1]) filterElements[1].style.backgroundColor = 'rgb(140, 0, 255)';
            targetArray = googleSheet_ad_PackageNames;
            break;
        case 'بكج رايد':
            if (filterElements[2]) filterElements[2].style.backgroundColor = 'rgb(140, 0, 255)';
            targetArray = googleSheet_rd_PackageNames;
            break;
        default:
            targetArray = []; // If none matches, set an empty array
            break;
    }

    // Loop through the target array and show the corresponding h3 elements
    for (let i = 0; i < targetArray.length; i++) {
        targetArray[i].style.display = 'block';
    }
}

resetPackageNamesFilterInputValue = function () {
    document.getElementById('import_google_sheet_data_names_search_bar_input_id').value = '';


    let targetWebsiteUserName = document.getElementById('website_users_name_input_id').value;

    /* Show only the h3 elements from the corresponding array based on the passed 'targetPackagesName' value */
    let targetArray;
    switch (targetWebsiteUserName) {
        case 'بكج بندر':
            targetArray = googleSheet_br_PackageNames;
            break;
        case 'بكج احمد':
            targetArray = googleSheet_ad_PackageNames;
            break;
        case 'بكج رايد':
            targetArray = googleSheet_rd_PackageNames;
            break;
        default:
            targetArray = []; // If none matches, set an empty array
            break;
    }

    /* Loop through the target array and show the corresponding h3 elements */
    for (let i = 0; i < targetArray.length; i++) {
        targetArray[i].style.display = 'block';
    }
}

// Function to handle the same functionality as the previous input event listener
function updateSearchFilterFunctionality() {

    if (document.getElementById('import_google_sheet_data_names_search_bar_input_id').value !== '') {
        // Select all elements with the class 'search_bar_input_class'
        document.querySelectorAll('.search_bar_input_class').forEach(input => {
            // Find the closest parent element with the class 'searchable_names_dropdown_class'
            let dropdownDiv = input.closest('.searchable_names_dropdown_class');

            // Set the height of the dropdown div to 70vh
            dropdownDiv.style.transition = 'height 0.1s ease-in-out';
            dropdownDiv.style.maxHeight = '70vh';
            dropdownDiv.style.minHeight = '70vh';

            // Filter the dropdown options based on input value
            let filter = input.value.trim().toLowerCase();
            let filterWords = filter.split(/\s+/);
            let options = dropdownDiv.querySelectorAll('h3');
            let visibleCount = 0;

            options.forEach(option => {
                let optionText = option.textContent.trim().toLowerCase();
                let matches = filterWords.every(word => optionText.includes(word));

                if (filter === '' && visibleCount < 6) {
                    option.style.display = 'block';
                    visibleCount++;
                } else {
                    option.style.display = matches ? 'block' : 'none';
                }
            });
        });
    }
}















// Function to find the selected name and call importContentForSelectedName
function findSelectedNameAndImportContent() {
    let selectedName = null;
    let allDataNames = document.querySelectorAll('#all_google_sheet_stored_data_names_for_importing_data_div h3');

    allDataNames.forEach(function (dataName) {
        if (dataName.style.backgroundColor === 'rgb(0, 155, 0)') {
            selectedName = dataName.innerText;
        }
    });

    if (selectedName) {

        // Play a sound effect
        playSoundEffect('success');

        // Run a function to import the data based on the name of the clicked h3
        importContentForSelectedName(selectedName);

    } else {

        // Play a sound effect
        playSoundEffect('error');
    }
}




// Function to import the content for the selected name
async function importContentForSelectedName(name) {
    // Hide all PDF content sections initially
    document.getElementById('downloaded_pdf_clint_data_page').style.display = 'none';
    document.getElementById('downloaded_pdf_package_including_data_page').style.display = 'none';
    document.getElementById('downloaded_pdf_flight_data_page').style.display = 'none';
    document.getElementById('downloaded_pdf_hotel_data_page').style.display = 'none';
    document.getElementById('downloaded_pdf_clint_movements_data_page').style.display = 'none';
    document.getElementById('downloaded_pdf_total_price_data_page').style.display = 'none';

    // Show a global loading overlay while importing
    showLoadingOverlay();

    try {
        // Fetch the full row for the selected name from Supabase (latest by timestamp)
        const { data: selectedRow, error } = await supabase
            .from('indo_all_package')
            .select('*')
            .eq('name', name)
            .order('package_indo_user_current_date', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('❌ Failed to fetch selected package:', error);
            hideOverlay();
            hideLoadingOverlay();
            return;
        }

        if (!selectedRow) {
            console.warn('No package found with name:', name);
            hideOverlay();
            hideLoadingOverlay();
            return;
        }

        // Clean break: new packages carry structured `package_data`. Packages saved under the
        // old HTML-only format have none and are no longer restorable.
        let pkgData = selectedRow.package_data;
        if (!pkgData) {
            hideOverlay();
            hideLoadingOverlay();
            alert('هذا البكج محفوظ بالنظام القديم ولم يعد يدعم الاستعادة.\nالرجاء إعادة إنشائه من جديد\n(مع كامل حبي واحترامي)');
            return;
        }
        if (typeof pkgData === 'string') {
            try { pkgData = JSON.parse(pkgData); } catch (e) { console.error('❌ Could not parse package_data:', e); }
        }

        // Rebuild every section's DOM from the structured data (re-renders with current markup)
        renderPackageFromData(pkgData);






        // Check if 'inserted_clint_movements_data_position_div' is empty OR hidden and hide its PDF container if true
        const movementsDiv = document.getElementById('inserted_clint_movements_data_position_div');
        const movementsPdf = document.getElementById('downloaded_pdf_clint_movements_data_page');
        if (movementsDiv && movementsPdf) {
            const inlineStyleDisplay = movementsDiv.style ? movementsDiv.style.display : '';
            const styleAttr = movementsDiv.getAttribute && movementsDiv.getAttribute('style') ? movementsDiv.getAttribute('style') : '';
            const computedDisplay = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(movementsDiv).display : '';
            const isHidden =
                inlineStyleDisplay === 'none' ||
                /(\b|;)display\s*:\s*none\b/i.test(styleAttr || '') ||
                computedDisplay === 'none';

            if (movementsDiv.children.length === 0 || isHidden) {
                movementsPdf.style.display = 'none';
            }
        }

        // Check if inserted_flight_data_position_div is empty and hide its container if true
        const flightDiv = document.getElementById('inserted_flight_data_position_div');
        const flightPdf = document.getElementById('downloaded_pdf_flight_data_page');
        if (flightDiv && flightPdf && flightDiv.children.length === 0) {
            flightPdf.style.display = 'none';
        }

        // Hide the total-price PDF page if there's no actual price text (the price lives as
        // text inside the <p>, not as child elements — so check innerText, not children).
        const totalPriceDiv = document.getElementById('package_total_price_pdf_p_id');
        const totalPricePdf = document.getElementById('downloaded_pdf_total_price_data_page');
        if (totalPriceDiv && totalPricePdf && totalPriceDiv.innerText.trim() === '') {
            totalPricePdf.style.display = 'none';
        }





        // Hide the overlay
        hideOverlay();
        hideLoadingOverlay();


        // Disable name input since we're editing existing data
        document.getElementById('website_users_name_input_id').disabled = true;

        // Hide all image elements initially
        document.querySelectorAll('.inserted_package_data_section_page_image_class, .inserted_package_data_section_page_image_class_2').forEach(img => {
            img.style.display = 'none';
        });

        // Show the company name image position
        const companyNameImageDiv = document.getElementById('inserted_company_name_image_position_div');
        if (companyNameImageDiv) companyNameImageDiv.style.display = 'flex';

        // Rebuild the price table from the imported hotel cards
        if (typeof buildPriceTable === 'function') buildPriceTable();









        // Process the package user code for version tracking
        let packageUserCode = document.getElementById('package_user_code_name_for_later_import_reference_p_id').innerText;
        let basePackageUserCode = packageUserCode.split('_riv_')[0];

        // Count existing versions of this package (base and all _riv_*)
        try {
            // Query names that start with base (server-side) - fetch all matching rows
            let likePattern = `${basePackageUserCode}%`;
            let allMatchingRows = [];
            const batchSize = 1000;
            let currentOffset = 0;
            let hasMoreData = true;

            // Fetch all matching rows in batches to ensure we get everything
            while (hasMoreData) {
                const { data: batchData, error: countError } = await supabase
                    .from('indo_all_package')
                    .select('name')
                    .like('name', likePattern)
                    .range(currentOffset, currentOffset + batchSize - 1);

                if (countError) throw countError;

                if (!batchData || batchData.length === 0) {
                    hasMoreData = false;
                    break;
                }

                allMatchingRows = allMatchingRows.concat(batchData);

                if (batchData.length < batchSize) {
                    hasMoreData = false;
                } else {
                    currentOffset += batchSize;
                }
            }

            // De-duplicate names first (table may contain multiple versions over time)
            let uniqueNames = Array.from(new Set((allMatchingRows || []).map(r => r.name)));

            // Precise-match: base OR base_riv_<number>
            let escapedBaseForRegex = basePackageUserCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let rivRegex = new RegExp(`^${escapedBaseForRegex}_riv_\\d+$`);
            let preciseMatches = uniqueNames.filter(n => n === basePackageUserCode || rivRegex.test(n));
            totalRivPackageNumberForUpdatingNewRivPackage = preciseMatches.length;
        } catch (countErr) {
            console.error('Error counting package versions:', countErr);
            // Fallback to cached names if count query fails
            let escapedBaseForRegex = basePackageUserCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let rivRegex = new RegExp(`^${escapedBaseForRegex}_riv_\\d+$`);
            let uniqueSheetNames = Array.from(new Set(sheetData.map(row => row.name)));
            totalRivPackageNumberForUpdatingNewRivPackage = uniqueSheetNames.filter(n => {
                return n === basePackageUserCode || rivRegex.test(n);
            }).length;
        }

        // Update the package code with the correct next riv index
        // If only base exists (count=1), next should be _riv_1; otherwise if base+_riv_2 exist (count=2), next is _riv_2, etc.
        // nextRivIndex equals number of similar names found (base + all _riv_N)
        let nextRivIndex = totalRivPackageNumberForUpdatingNewRivPackage <= 0 ? 1 : totalRivPackageNumberForUpdatingNewRivPackage;
        document.getElementById('package_user_code_name_for_later_import_reference_p_id').innerText =
            `${document.getElementById('store_google_sheet_package_raw_user_with_no_riv_for_later_reference_when_importing').innerText}_riv_${nextRivIndex}`;

        // Set flags for new data creation
        existingDataStatus = 'newData';
        websiteUserUniqueNumber = 'existingUniqueNumber';









        // Update allowed dates for the package
        updateAllowedDates();

    } catch (error) {
        console.error('Error importing package content:', error);
        hideLoadingOverlay();
    }

}

// Create and show a simple full-screen loading overlay
function showLoadingOverlay() {
    if (document.getElementById('global_loading_overlay')) return;

    let overlay = document.createElement('div');
    overlay.id = 'global_loading_overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0, 0, 0, 0.35)';
    overlay.style.backdropFilter = 'blur(2px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 200ms ease';

    // Spinner element
    let spinner = document.createElement('div');
    spinner.style.width = '36px';
    spinner.style.height = '36px';
    spinner.style.border = '6px solid rgba(255,255,255,0.35)';
    spinner.style.borderTopColor = '#ffffff';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'global_loading_spin 0.8s linear infinite';

    // Add keyframes once
    if (!document.getElementById('global_loading_styles')) {
        let style = document.createElement('style');
        style.id = 'global_loading_styles';
        style.textContent = '@keyframes global_loading_spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(style);
    }

    overlay.appendChild(spinner);
    document.body.appendChild(overlay);

    // Trigger fade-in
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
    });
}

// Hide and remove the loading overlay smoothly
function hideLoadingOverlay() {
    let overlay = document.getElementById('global_loading_overlay');
    if (!overlay) return;
    overlay.style.opacity = '0';
    setTimeout(() => {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }, 220);
}





// Function to pick google sheet data names
function pickThisGoogleSheetDataName(clickedGoogleSheetDataName) {

    /* in case the clicked h3 is already picked then import it directly */
    if (clickedGoogleSheetDataName.style.backgroundColor === 'rgb(0, 155, 0)') {

        /* Run a function to import that picked h3 element from the google sheet databse */
        findSelectedNameAndImportContent();

        /* if the clikced h3 is not picked then just highlight it as a new picked one */
    } else {

        // Get all <h3> elements inside the 'all_google_sheet_stored_data_names_for_importing_data_div' div
        let allGoogleSheetStoredDataNamesForImportingDataDiv = document.querySelectorAll('#all_google_sheet_stored_data_names_for_importing_data_div h3');

        // Loop through each <h3> element to reset their styles
        allGoogleSheetStoredDataNamesForImportingDataDiv.forEach(function (dataName) {
            dataName.style.backgroundColor = 'white';
            dataName.style.color = 'black';
        });


        // Set the background color and text color of the clicked <h3> element
        clickedGoogleSheetDataName.style.backgroundColor = 'rgb(0, 155, 0)';
        clickedGoogleSheetDataName.style.color = 'white';

    }
}







/* Function to filter the google sheet packages names */
fliterGoogleSheetPackagesNames = function (clickedElement, targetPackagesName) {
    /* Reset all other <p> elements background color */
    let elements = document.getElementsByClassName('filter_google_sheet_packages_names_p_class');
    for (let i = 0; i < elements.length; i++) {
        elements[i].style.backgroundColor = 'rgb(255, 174, 0)';
    }

    /* Change the background color of the clicked <p> element */
    clickedElement.style.backgroundColor = 'rgb(140, 0, 255)';

    /* First, hide all <h3> elements */
    let allH3Elements = document.getElementById('all_google_sheet_stored_data_names_for_importing_data_div').getElementsByTagName('h3');
    for (let i = 0; i < allH3Elements.length; i++) {
        allH3Elements[i].style.display = 'none';
    }

    /* Show only the h3 elements from the corresponding array based on the passed 'targetPackagesName' value */
    let targetArray;
    switch (targetPackagesName) {
        case 'googleSheet_br_PackageNames':
            targetArray = googleSheet_br_PackageNames;
            break;
        case 'googleSheet_ad_PackageNames':
            targetArray = googleSheet_ad_PackageNames;
            break;
        case 'googleSheet_rd_PackageNames':
            targetArray = googleSheet_rd_PackageNames;
            break;
        default:
            targetArray = []; // If none matches, set an empty array
            break;
    }

    /* Loop through the target array and show the corresponding h3 elements */
    for (let i = 0; i < targetArray.length; i++) {
        targetArray[i].style.display = 'block';
    }


    updateSearchFilterFunctionality();
};

/* Function to show the website username package names */
showWebsiteUsernamePackageNames = function () {
    let allGoogleSheetStoredDataNamesForImportingDataDiv = document.getElementById('all_google_sheet_stored_data_names_for_importing_data_div');

    // Get the value of the input
    let userNameInput = document.getElementById('website_users_name_input_id').value;

    // Get all p elements with the class name 'filter_google_sheet_packages_names_p_class'
    let filterElements = document.getElementsByClassName('filter_google_sheet_packages_names_p_class');

    // Reset the background color of all elements before applying new changes
    for (let i = 0; i < filterElements.length; i++) {
        filterElements[i].style.backgroundColor = ''; // Reset background color
    }


    /* Show only the h3 elements from the corresponding array based on the passed 'targetPackagesName' value */
    let targetArray = [];


    // Apply the background color based on the input value
    switch (userNameInput) {
        case 'بكج بندر':
            if (filterElements[0]) filterElements[0].style.backgroundColor = 'rgb(140, 0, 255)';
            targetArray = googleSheet_br_PackageNames;
            break;
        case 'بكج احمد':
            if (filterElements[1]) filterElements[1].style.backgroundColor = 'rgb(140, 0, 255)';
            targetArray = googleSheet_ad_PackageNames;
            break;
        case 'بكج رايد':
            if (filterElements[2]) filterElements[2].style.backgroundColor = 'rgb(140, 0, 255)';
            targetArray = googleSheet_rd_PackageNames;
            break;
        default:
            targetArray = []; // If none matches, set an empty array
            break;
    }

    // First, hide all h3 elements in the div
    let allH3Elements = allGoogleSheetStoredDataNamesForImportingDataDiv.getElementsByTagName('h3');
    for (let i = 0; i < allH3Elements.length; i++) {
        allH3Elements[i].style.display = 'none';
    }

    // Loop through the target array and show the corresponding h3 elements
    for (let i = 0; i < targetArray.length; i++) {
        targetArray[i].style.display = 'block';
    }
}





























// Variable to store the most top empty cell row number
let mostTopEmptyCellRowNumberValue;

async function handleUserPackageUniqueNumber(userType, action) {
    // Validate userType
    const validUserTypes = [
        'بكج بندر', 'بكج احمد', 'بكج رايد'
    ];

    if (!validUserTypes.includes(userType)) {
        throw new Error(`Invalid userType. Must be one of: ${validUserTypes.join(', ')}`);
    }

    try {
        // Fetch the first (and presumably only) row
        const { data, error } = await supabase
            .from('indo_package_unique_number')
            .select('*')
            .limit(1)
            .single();

        if (error) throw error;
        if (!data) throw new Error('No data found in the table');

        if (action === 'fetch') {
            // Store the current value
            mostTopEmptyCellRowNumberValue = data[userType];

            // Enable the submit button
            let submitIcon = document.getElementById('clint_inputs_submit_icon');
            submitIcon.style.opacity = '1';
            submitIcon.style.pointerEvents = 'auto';
            submitIcon.disabled = false;

            return data[userType];

        } else if (action === 'insert') {
            // Calculate new value
            const newValue = data[userType] + 1;

            // Update only the specific column
            // Use the first valid column name in your filter instead of 'baby'
            const { error: updateError } = await supabase
                .from('indo_package_unique_number')
                .update({ [userType]: newValue })
                .not(userType, 'is', null); // Use the same userType as filter

            if (updateError) throw updateError;

            return newValue;
        }
    } catch (error) {
        console.error('Error in handleUserPackageUniqueNumber:', error);
        throw error;
    }
}





























































/* Function to re-active the drag and drop functionality (copied code for the main inserted daa js code) */
reActiveDragAndDropFunctionality = function (visiableDivIdName) {


    if (visiableDivIdName === 'downloaded_pdf_clint_data_page') {




        /* in 01 Oct 2026 delete the following two lines (I used it to check if the imported package is new or old "For styling purposes") */
        /* Check if the Important_notes_for_each_pdf_section_div_class div exists inside downloaded_pdf_clint_data_page */
        let importantNotesDiv = document.getElementById('downloaded_pdf_clint_data_page').querySelector('.Important_notes_for_each_pdf_section_div_class');
        /* If the div doesn't exist and alert hasn't been shown yet, show the alert */
        if (!importantNotesDiv) {
            alert('ترا البكج ذا قديم ولازم تسويه مره ثانية عشان التحديث\n(مع كامل حبي واحترامي)');
        }

        let newArAndEngRoomTypeUpdate = document.getElementById('downloaded_pdf_clint_data_page').querySelector('.new_ar_and_eng_room_type_update');
        /* If the div doesn't exist and alert hasn't been shown yet, show the alert */
        if (!newArAndEngRoomTypeUpdate) {
            alert('دبل شيك اسماء غرف الفنادق في هذا البكج عشان التحديث الجديد');
        }







        /* First Re-Enter the inputs values if they exist in the stored google sheet p elements */
        document.getElementById('package_clint_name_input_id').value = document.getElementById('store_google_sheet_clint_name_value').innerText;
        document.getElementById('package_clint_code_number_input_id').value = '';



        /* Set the value of the 'package_clint_code_number_input_id' input based on the 'store_google_sheet_package_clint_code_number_value' innerText */
        document.getElementById('package_clint_code_number_input_id').value = document.getElementById('store_google_sheet_package_clint_code_number_value').innerText;



        document.getElementById('adult_package_person_amount_input_id').value = document.getElementById('store_google_sheet_package_adult_amount_value').innerText;
        document.getElementById('kids_package_person_amount_input_id').value = document.getElementById('store_google_sheet_package_kids_amount_value').innerText;



        /* Set the value of the 'infant_package_person_amount_input_id' input based on the 'store_google_sheet_package_infant_amount_value' innerText */
        document.getElementById('infant_package_person_amount_input_id').value = document.getElementById('store_google_sheet_package_infant_amount_value').innerText;



        document.getElementById('whole_package_start_date_input_id').value = document.getElementById('store_google_sheet_whole_package_first_date_value').innerText;
        document.getElementById('whole_package_end_date_input_id').value = document.getElementById('store_google_sheet_whole_package_last_date_value').innerText;
        document.getElementById('package_total_nights_input_id').value = `${document.getElementById('store_google_sheet_whole_package_total_nights_value').innerText} ليالي`;


        /* Store the total package nights in a separated variable for later use when inserting data */
        storePackageTotalNights = document.getElementById('store_google_sheet_whole_package_total_nights_value').innerText;


        document.getElementById('clint_company_name_input_id').value = document.getElementById('store_google_sheet_clint_company_name_value').innerText;



        /* The following code will be replaced with the folloiwng code line
        document.getElementById('website_users_name_input_id').value = document.getElementById('store_google_sheet_package_user_name_value').innerText;
 
        until 20 Sept 2024 Delete this following code and use the upper code line
        */
        if (document.getElementById('store_google_sheet_package_user_name_value')) {
            document.getElementById('website_users_name_input_id').value = document.getElementById('store_google_sheet_package_user_name_value').innerText;

        } else {
            document.getElementById('website_users_name_input_id').value = 'بكج بندر';
        }






        /* Check the package type checkbox based on the innerText of the 'store_google_sheet_clint_package_price_type_checkbox_value' */
        /* on 10 Mar 2025 delete the following if "store_google_sheet_clint_package_price_type_checkbox_value" exist or no condition (I used it to avoid error in old saved packages) */
        if (document.getElementById('store_google_sheet_clint_package_price_type_checkbox_value')) {

            if (document.getElementById('store_google_sheet_clint_package_price_type_checkbox_value').innerText === 'بكج إقتصادي') {
                document.getElementById('economy_package_checkbox').checked = true;
                document.getElementById('medium_package_checkbox').checked = false;
                document.getElementById('vip_package_checkbox').checked = false;

            } else if (document.getElementById('store_google_sheet_clint_package_price_type_checkbox_value').innerText === 'بكج متوسط') {
                document.getElementById('economy_package_checkbox').checked = false;
                document.getElementById('medium_package_checkbox').checked = true;
                document.getElementById('vip_package_checkbox').checked = false;

            } else if (document.getElementById('store_google_sheet_clint_package_price_type_checkbox_value').innerText === 'بكج VIP') {
                document.getElementById('economy_package_checkbox').checked = false;
                document.getElementById('medium_package_checkbox').checked = false;
                document.getElementById('vip_package_checkbox').checked = true;

            }



            if (document.getElementById('package_price_type_h6_id').innerText === '') {
                /* Hide the element if there is no text in it */
                document.getElementById('package_price_type_h6_id').style.display = 'none';

            } else {
                /* Show the element if there is any text in it */
                document.getElementById('package_price_type_h6_id').style.display = 'block';

            }
        }






        /* Check the package type checkbox based on the innerText of the 'store_google_sheet_clint_package_type_checkbox_value' */
        if (document.getElementById('store_google_sheet_clint_package_type_checkbox_value').innerText === 'بكج شهل عسل') {
            document.getElementById('honeymoon_checkbox').checked = true;
            document.getElementById('guys_checkbox').checked = false;
            document.getElementById('family_checkbox').checked = false;
            document.getElementById('two_people_checkbox').checked = false;
            document.getElementById('group_of_people_checkbox').checked = false;

        } else if (document.getElementById('store_google_sheet_clint_package_type_checkbox_value').innerText === 'بكج شباب') {
            document.getElementById('honeymoon_checkbox').checked = false;
            document.getElementById('guys_checkbox').checked = true;
            document.getElementById('family_checkbox').checked = false;
            document.getElementById('two_people_checkbox').checked = false;
            document.getElementById('group_of_people_checkbox').checked = false;

        } else if (document.getElementById('store_google_sheet_clint_package_type_checkbox_value').innerText === 'بكج عائلة') {
            document.getElementById('honeymoon_checkbox').checked = false;
            document.getElementById('guys_checkbox').checked = false;
            document.getElementById('family_checkbox').checked = true;
            document.getElementById('two_people_checkbox').checked = false;
            document.getElementById('group_of_people_checkbox').checked = false;

        } else if (document.getElementById('store_google_sheet_clint_package_type_checkbox_value').innerText === 'بكج شخصين') {
            document.getElementById('honeymoon_checkbox').checked = false;
            document.getElementById('guys_checkbox').checked = false;
            document.getElementById('family_checkbox').checked = false;
            document.getElementById('two_people_checkbox').checked = true;
            document.getElementById('group_of_people_checkbox').checked = false;


        } else if (document.getElementById('store_google_sheet_clint_package_type_checkbox_value').innerText === 'بكج قروب') {
            document.getElementById('honeymoon_checkbox').checked = false;
            document.getElementById('guys_checkbox').checked = false;
            document.getElementById('family_checkbox').checked = false;
            document.getElementById('two_people_checkbox').checked = false;
            document.getElementById('group_of_people_checkbox').checked = true;



            /* in case if there is no any check input then unckeck all inputs */
        } else {
            document.getElementById('honeymoon_checkbox').checked = false;
            document.getElementById('guys_checkbox').checked = false;
            document.getElementById('family_checkbox').checked = false;
            document.getElementById('two_people_checkbox').checked = false;
            document.getElementById('group_of_people_checkbox').checked = false;
        }



        /* Function to reActive the company logo delete functionality */
        if (document.getElementById('inserted_company_name_logo_id')) {

            document.getElementById('inserted_company_name_logo_id').onclick = function () {
                event.stopPropagation(); // Stop the event from propagating further

                // Create overlay layer
                let overlayLayer = document.createElement('div');
                overlayLayer.className = 'black_overlay';
                overlayLayer.id = 'black_overlay_id';
                document.body.appendChild(overlayLayer);

                // Show overlay layer with smooth opacity transition
                setTimeout(() => {
                    overlayLayer.style.opacity = '1'; // Delayed opacity transition for smooth appearance
                }, 100);

                // Slide in delete box options div
                let deleteHotelCardDiv = document.getElementById('ensure_delete_company_logo_div');

                // Smoothly slide to the middle of the screen
                setTimeout(() => {
                    deleteHotelCardDiv.style.transform = 'translate(-50%, -50%)'; // Slide to the center of the screen
                }, 50); // Adjust timing as needed

                // Event listener to close overlay and delete box div on click outside
                overlayLayer.onclick = () => {
                    // Hide delete box options div
                    deleteHotelCardDiv.style.transform = 'translate(-50%, -130vh)';

                    // Hide overlay layer with opacity transition
                    overlayLayer.style.opacity = '0';

                    // Remove overlay and delete box div from DOM after transition
                    setTimeout(() => {
                        document.body.removeChild(overlayLayer);
                    }, 300); // Match transition duration in CSS
                };
            };
        }









        /* Based on the 'store_google_sheet_all_package_dates_hidden_or_no' innerText set the background color of hide all package dates icon */
        if (document.getElementById('store_google_sheet_all_package_dates_hidden_or_no').innerText === 'hide all package dates') {
            /* Change the icon background color */
            document.getElementById('hide_all_package_dates_icon').style.backgroundColor = 'rgb(0, 255, 0)';
            document.getElementById('hide_all_package_dates_icon').style.color = 'black';


        } else {
            /* Change the icon background color */
            document.getElementById('hide_all_package_dates_icon').style.backgroundColor = 'rgb(0, 87, 116)';
            document.getElementById('hide_all_package_dates_icon').style.color = 'white';

        }




    } else if (visiableDivIdName === 'downloaded_pdf_flight_data_page') {


        // Get all elements with the class name 'flight_row_class'
        let flightRowTableDivs = document.querySelectorAll('.flight_row_class');

        // Loop through each 'flight_row_class' element
        flightRowTableDivs.forEach(flightRowTableDiv => {
            // Get all dynamically created elements with the class 'flight_row_flight_arrival_time_controller'
            flightRowTableDiv.querySelectorAll('.flight_row_flight_arrival_time_controller').forEach(function (element) {
                element.onclick = function (event) {
                    flightRowAirLineControllerFunction(event, element);
                };
            });

        });



        /* Hide the icon button after creating a flight row */
        document.getElementById('manually_add_flight_row_icon').style.display = 'none';




        /* Restore the variable number for keeping unique id name for each flight row */
        insertedFlightDataDivUniqueId = document.getElementById('store_google_sheet_flight_uniuqe_id_name_value').innerText;


    } else if (visiableDivIdName === 'downloaded_pdf_hotel_data_page') {



        // Get all elements with the class name 'hotel_row_class'
        let hotelRowTableDivs = document.querySelectorAll('.hotel_row_class');


        /* Re-store the last stopped hotel check out date */
        document.getElementById('hotel_check_in_input_id').value = document.getElementById('store_google_sheet_hotel_last_stopped_check_out_date_value').innerText;
        document.getElementById('hotel_check_in_input_id').disabled = true;



        // Loop through each 'hotel_row_class' element
        hotelRowTableDivs.forEach(hotelRowTableDiv => {
            // Get the 'hotel_row_image_controller' elements inside each 'hotel_row_class' element
            let hotelRowImageControllers = hotelRowTableDiv.querySelectorAll('.hotel_row_image_controller');


            // Attach click and touch event listeners to each element
            hotelRowImageControllers.forEach(element => {
                handleClickEvent(element);
            });

        });



        // Reset the drag-drop guard flag so the freshly-imported DOM re-registers its listener
        // (the flag gets stored in the DB with the HTML and would otherwise block re-registration)
        const _dropZoneForReset = document.getElementById('inserted_hotel_data_position_div');
        if (_dropZoneForReset) delete _dropZoneForReset.dataset.hotelDragDropReady;

        // Call the function to set up drag-and-drop functionality
        createHotelDragAndDropMood();



        // Call a function to save the current dates of all hotels for later Re-arranging use (when drag and drop)
        saveOriginalHotelDates();



    } else if (visiableDivIdName === 'downloaded_pdf_clint_movements_data_page') {


        // Get all elements with the class name 'flight_row_class'
        let clintMovementsRowTableDiv = document.querySelectorAll('.clint_movements_row_class_for_editing');



        /* Update the available clint visiting places based on the current existing visiting places */
        filterUsedClintVisitingPlacesNames();


        // Loop through each 'flight_row_class' element
        clintMovementsRowTableDiv.forEach(clintMovementsRowTableDiv => {

            // Get all dynamically created elements with the class 'clint_movements_row_controller'
            clintMovementsRowTableDiv.querySelectorAll('.clint_movements_row_controller').forEach(function (element) {
                element.onclick = function (event) {
                    clintMovementsRowCityNameControllerFunction(event, element);
                };
            });

        });



        // Target all divs with the class "clint_movements_row_class_for_editing"
        let clintMovementDivs = document.querySelectorAll(".clint_movements_row_class_for_editing");

        // Iterate through each found clint_movements_row_class_for_editing div
        clintMovementDivs.forEach(clintMovementDiv => {

            // Target all child divs inside the current clint_movements_row_class_for_editing div
            let childDivs = clintMovementDiv.querySelectorAll("div");

            // Set background to white and color to black for each child div
            childDivs.forEach(childDiv => {
                childDiv.style.backgroundColor = "white";
                childDiv.style.color = "black";
            });
        });



        /* Call a function to highlight the Saturday and Sanday days */
        highlightWeekendClintMovements();





    } else if (visiableDivIdName === 'downloaded_pdf_package_including_data_page') {

        /* Re-Enter the inputs values if they exist in the stored google sheet p elements */
        document.getElementById('sms_card_with_internet_amount_input_id').value = document.getElementById('store_google_sheet_package_including_sms_value').innerText;
        document.getElementById('inner_flight_tickets_amount_input_id').value = document.getElementById('store_google_sheet_package_including_inner_tickets_value').innerText;
        document.getElementById('package_details_textarea_id').value = document.getElementById('store_google_sheet_package_details_textarea_value').innerText.replace(/\\n/g, '\n');



        /* Check or uncheck the show total package price in the pdf file checkbox input */
        /*         if (document.getElementById('store_google_sheet_show_price_in_pdf_checked_or_no').innerHTML == 'showPrice') {
                    document.getElementById('show_package_total_price_checkbox').checked = true;
        
                } else if (document.getElementById('store_google_sheet_show_price_in_pdf_checked_or_no').innerHTML == 'hidePrice') {
                    document.getElementById('show_package_total_price_checkbox').checked = false;
        
                } */



        /* Set the value of the 'specific_car_type_input_id' input based on the 'store_google_sheet_package_specific_car_type_value' innerText */
        document.getElementById('specific_car_type_input_id').value = document.getElementById('store_google_sheet_package_specific_car_type_value').innerText;




        // Array of checkbox IDs
        let checkboxIds = [
            'privet_car_with_driver_to_welcome_and_etc_checkbox',
            'extra_car_for_carring_bags_checkbox',
            'hotel_booking_with_breakfast_for_2_people_checkbox',
            'welcome_goodbye_hotel_delivery_checkbox',
            'customer_service_24_hour_checkbox',
            'sms_card_with_internet_checkbox',
            'inner_flight_tickets_checkbox',
            'outer_flight_tickets_checkbox',
            'placese_visiting_cost_checkbox',
            'bali_taxes_not_covered_checkbox'
        ];

        // Uncheck all inputs and reset their color
        checkboxIds.forEach(id => {
            let checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.checked = false; // Uncheck the checkbox
                let label = checkbox.nextElementSibling; // Get the label element
                label.style.setProperty('--checkbox-color', 'rgb(255, 255, 255)'); // Reset to white
            }
        });

        // Helper function to set checkbox color based on the div
        function setColorFromDiv(divId, color) {
            let div = document.getElementById(divId);
            if (div) {
                let pElements = div.getElementsByTagName('p'); // Get all p elements inside the div
                Array.from(pElements).forEach(p => {
                    let checkboxId = p.innerText; // Get the checkbox ID from the p element
                    let checkbox = document.getElementById(checkboxId); // Find the checkbox by its ID
                    if (checkbox) {
                        let label = checkbox.nextElementSibling; // Get the label element
                        label.style.setProperty('--checkbox-color', color); // Set the new color
                    }
                });
            }
        }

        // Apply colors to checkboxes based on p elements in each div
        setColorFromDiv('store_google_sheet_green_checked_package_including_and_not_including_input_div', 'rgb(0, 255, 0)'); // Green
        setColorFromDiv('store_google_sheet_red_checked_package_including_and_not_including_input_div', 'rgb(255, 0, 0)'); // Red
        setColorFromDiv('store_google_sheet_white_package_including_and_not_including_input_div', 'rgb(255, 255, 255)'); // White


    }
}