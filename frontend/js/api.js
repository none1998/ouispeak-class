// ============================================================
// One helper for every call to the C# API.
// It automatically sends the student's Supabase login token.
// Needs: config.js (API_URL) and _supabase (created by the page).
// ============================================================
async function api(path, options = {}) {
    const { data } = await _supabase.auth.getSession();
    const token = data.session ? data.session.access_token : null;

    const response = await fetch(API_URL + path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || ("Error " + response.status));
    }
    return response.status === 204 ? null : response.json();
}
