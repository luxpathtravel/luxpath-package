/* Visitor counter — fires on every page load / reload, adds 1 to the current
   month in the visitors_counter table (Luxpath Systems project).
   Standalone: plain fetch, no dependency on the Supabase client, so it runs
   even if the supabase-js CDN is slow or blocked. */
(function () {
    const RPC_URL = 'https://eswvhssnfhogxmjsapms.supabase.co/rest/v1/rpc/increment_visitor_counter';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzd3Zoc3NuZmhvZ3htanNhcG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjYxMTEsImV4cCI6MjA5Njk0MjExMX0.-lOpbQyPn8Ycwu_jkSUzAl-1wrvjCiEzr-LExPBaZdE';

    // The month is decided server-side inside the RPC, so a visitor can't spoof it.
    function countVisit() {
        fetch(RPC_URL, {
            method: 'POST',
            headers: {
                'apikey': KEY,
                'Authorization': `Bearer ${KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
            body: '{}',
            keepalive: true,
        }).catch(function () { /* never let the counter break the page */ });
    }

    // Defer to idle so the count never competes with content requests
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(countVisit, { timeout: 2000 });
    } else {
        setTimeout(countVisit, 0);
    }
})();
