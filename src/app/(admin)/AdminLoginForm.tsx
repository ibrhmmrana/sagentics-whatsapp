"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminLoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("login_failed") === "1") {
      setError("Invalid password");
    }
  }, [searchParams]);

  return (
    <div className="admin-login">
      <h1 className="admin-login__title">Admin Login</h1>
      <form
        action="/api/admin/login"
        method="POST"
        className="admin-login__form"
        onSubmit={() => setError("")}
      >
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          className="admin-login__input"
        />
        <button type="submit" className="admin-login__btn">
          Log in
        </button>
        {error && <p className="admin-login__error">{error}</p>}
      </form>
    </div>
  );
}
