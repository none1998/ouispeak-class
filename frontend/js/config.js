// ============================================================
// Shared settings for every page. Change them in ONE place.
// The anon/publishable key is designed to be public; your data
// is protected by Row Level Security rules in Supabase.
// ============================================================
const SUPABASE_URL = "https://yuydaturorsdshtdajcf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xlmbZTsExgJWyjN9IdC8xA_NaILka38";

// Address of your C# API. Local while developing, your real server once deployed.
const API_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "http://localhost:5080"
    : "https://ouispeak-class.onrender.com";
