/* Visitor counter — fires on every page load / reload, adds 1 to the current
   month in the visitors_counter table (Luxpath Systems project).
   Standalone: plain fetch, no dependency on the Supabase client, so it runs
   even if the supabase-js CDN is slow or blocked.

   Logs the whole operation to the browser console so the count can be
   followed live. Set DEBUG to false to silence it. */
(function () {
    const DEBUG = true;
    const PROJECT = 'Luxpath Systems (eswvhssnfhogxmjsapms)';
    const RPC_URL = 'https://eswvhssnfhogxmjsapms.supabase.co/rest/v1/rpc/increment_visitor_counter';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzd3Zoc3NuZmhvZ3htanNhcG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjYxMTEsImV4cCI6MjA5Njk0MjExMX0.-lOpbQyPn8Ycwu_jkSUzAl-1wrvjCiEzr-LExPBaZdE';

    const TAG = '%c[Visitor Counter]';
    const CSS = 'background:#0A2540;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold';

    function logStart() {
        if (!DEBUG) return;
        console.log(TAG + '%c Counting this visit…', CSS, 'color:#888');
    }

    function logSuccess(d, ms) {
        if (!DEBUG) return;
        console.group(TAG + `%c ✅ +1 visitor counted — ${d.month_label} ${d.year}`, CSS, 'color:#0a7c3a;font-weight:bold');
        console.log(`Month column   : ${d.month}`);
        console.log(`Before         : Visitors ${d.before}`);
        console.log(`Added          : +${d.added}`);
        console.log(`After          : Visitors ${d.after}`);
        console.log(`Stored value   : ${JSON.stringify(d.after_value)}`);
        console.table({
            before: { 'visitors': d.before, 'column value': JSON.stringify(d.before_value) },
            after: { 'visitors': d.after, 'column value': JSON.stringify(d.after_value) },
        });
        console.log(`Project        : ${PROJECT}`);
        console.log(`Table          : ${d.table}`);
        console.log(`Page counted   : ${location.href}`);
        console.log(`Server time    : ${d.server_time} (${d.timezone})`);
        console.log(`Round trip     : ${ms} ms`);
        console.groupEnd();
    }

    function logFailure(reason, detail, ms) {
        if (!DEBUG) return;
        console.group(TAG + '%c ❌ visit NOT counted', CSS, 'color:#c02626;font-weight:bold');
        console.error(`Reason      : ${reason}`);
        if (detail !== undefined) console.error('Detail      :', detail);
        console.log(`Project     : ${PROJECT}`);
        console.log(`Endpoint    : ${RPC_URL}`);
        console.log(`Page        : ${location.href}`);
        console.log(`Elapsed     : ${ms} ms`);
        console.groupEnd();
    }

    // The month is decided server-side inside the RPC, so a visitor can't spoof it.
    function countVisit() {
        const t0 = performance.now();
        logStart();

        fetch(RPC_URL, {
            method: 'POST',
            headers: {
                'apikey': KEY,
                'Authorization': `Bearer ${KEY}`,
                'Content-Type': 'application/json',
            },
            body: '{}',
            keepalive: true,
        })
            .then(async (res) => {
                const ms = Math.round(performance.now() - t0);
                const text = await res.text();

                if (!res.ok) {
                    logFailure(`HTTP ${res.status} ${res.statusText}`, text, ms);
                    return;
                }
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    logFailure('Response was not valid JSON', text, ms);
                    return;
                }
                logSuccess(data, ms);
            })
            .catch(function (err) {
                // Network error, CSP block, offline, ad-blocker, etc.
                logFailure('Request failed before reaching the server', err && err.message, Math.round(performance.now() - t0));
            });
    }

    // Defer to idle so the count never competes with content requests
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(countVisit, { timeout: 2000 });
    } else {
        setTimeout(countVisit, 0);
    }
})();
