"use client";

import { useState } from "react";

export default function AdminLoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value?.trim();

    if (!password) {
      setError("Password required");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Login failed");
        setLoading(false);
        return;
      }

      // Cookie is set via Set-Cookie on the 200 response.
      // Full page reload so the server layout picks up the cookie.
      window.location.href = "/";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <h1 className="admin-login__title">Admin Login</h1>
      <form
        onSubmit={handleSubmit}
        className="admin-login__form"
      >
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          className="admin-login__input"
        />
        <button type="submit" disabled={loading} className="admin-login__btn">
          {loading ? "Logging in..." : "Log in"}
        </button>
        {error && <p className="admin-login__error">{error}</p>}
      </form>
    </div>
  );
}
