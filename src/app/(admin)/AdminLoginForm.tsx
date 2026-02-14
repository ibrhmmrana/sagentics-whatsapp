"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value?.trim();

    if (!email || !password) {
      setError("Email and password are required");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message === "Invalid login credentials"
        ? "Invalid email or password"
        : signInError.message);
      setLoading(false);
      return;
    }

    // Persist session via server-set cookies so auth survives refresh (custom domain).
    if (data?.session?.access_token && data?.session?.refresh_token) {
      const setRes = await fetch("/api/auth/set-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }),
      });
      // Log diagnostics for debugging cookie issues
      try {
        const setResBody = await setRes.clone().json();
        console.log("[auth] set-session response:", setResBody);
      } catch {}
      if (!setRes.ok) {
        setError("Session could not be saved. Try again.");
        setLoading(false);
        return;
      }
    } else {
      console.warn("[auth] signInWithPassword did not return session tokens");
    }

    // Check if cookies were written to document.cookie
    const hasSbCookie = document.cookie.includes("sb-");
    console.log("[auth] document.cookie has sb- cookie:", hasSbCookie);
    console.log("[auth] all cookie names:", document.cookie.split(";").map(c => c.trim().split("=")[0]));

    window.location.href = "/";
  }

  return (
    <div className="admin-login">
      <h1 className="admin-login__title">Admin Login</h1>
      <p className="admin-login__hint">Sign in with your account. No sign ups — users are added by an admin.</p>
      <form onSubmit={handleSubmit} className="admin-login__form">
        <input
          type="email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          required
          className="admin-login__input"
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          className="admin-login__input"
        />
        <button type="submit" disabled={loading} className="admin-login__btn">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {error && <p className="admin-login__error">{error}</p>}
      </form>
    </div>
  );
}
