"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

const FB_APP_ID = process.env.NEXT_PUBLIC_FB_APP_ID ?? "";
const FB_CONFIG_ID = process.env.NEXT_PUBLIC_FB_CONFIG_ID ?? "";

interface Connection {
  id: number;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  display_name: string | null;
  connected_at: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  if (session?.access_token)
    return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (
        callback: (response: {
          authResponse?: { code?: string };
          status?: string;
        }) => void,
        options: Record<string, unknown>
      ) => void;
    };
  }
}

export default function ConnectPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const sdkLoaded = useRef(false);

  const sessionInfoRef = useRef<{
    phone_number_id?: string;
    waba_id?: string;
  }>({});

  const fetchConnections = useCallback(async () => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/connect", {
      credentials: "include",
      headers: authHeaders,
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setConnections(data.connections ?? []);
    }
  }, []);

  // Load Facebook SDK
  useEffect(() => {
    if (sdkLoaded.current || !FB_APP_ID) return;
    sdkLoaded.current = true;

    window.fbAsyncInit = function () {
      window.FB?.init({
        appId: FB_APP_ID,
        cookie: true,
        xfbml: true,
        version: "v20.0",
      });
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  // Listen for session info messages from the Embedded Signup popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      )
        return;

      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        if (data.type === "WA_EMBEDDED_SIGNUP") {
          if (data.event === "FINISH") {
            sessionInfoRef.current = {
              phone_number_id: data.data?.phone_number_id,
              waba_id: data.data?.waba_id,
            };
          } else if (data.event === "CANCEL") {
            setConnecting(false);
            setError("Signup was cancelled.");
          }
        }
      } catch {
        // not a JSON message we care about
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    fetchConnections().finally(() => setLoading(false));
  }, [fetchConnections]);

  const handleConnect = () => {
    if (!window.FB) {
      setError("Facebook SDK not loaded yet. Please try again.");
      return;
    }
    if (!FB_CONFIG_ID) {
      setError("Facebook config_id is not configured.");
      return;
    }

    setError(null);
    setSuccess(null);
    setConnecting(true);
    sessionInfoRef.current = {};

    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setConnecting(false);
          if (response.status !== "connected") {
            setError("Login was cancelled or failed.");
          }
          return;
        }

        // Wait briefly for the session info message to arrive
        await new Promise((r) => setTimeout(r, 1500));

        const { phone_number_id, waba_id } = sessionInfoRef.current;
        if (!phone_number_id || !waba_id) {
          setConnecting(false);
          setError(
            "Could not retrieve WhatsApp account details from the signup flow. Please try again."
          );
          return;
        }

        try {
          const authHeaders = await getAuthHeaders();
          const res = await fetch("/api/admin/whatsapp/connect", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              code,
              phoneNumberId: phone_number_id,
              wabaId: waba_id,
            }),
          });

          const data = await res.json();
          if (!res.ok) {
            setError(data.error ?? "Failed to connect.");
          } else {
            setSuccess("WhatsApp account connected successfully!");
            await fetchConnections();
          }
        } catch (err) {
          setError(
            `Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        } finally {
          setConnecting(false);
        }
      },
      {
        config_id: FB_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          feature: "whatsapp_embedded_signup",
          sessionInfoVersion: 3,
        },
      }
    );
  };

  const handleDisconnect = async (id: number) => {
    setError(null);
    setSuccess(null);
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/connect", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setSuccess("Disconnected.");
      await fetchConnections();
    } else {
      setError("Failed to disconnect.");
    }
  };

  return (
    <div className="knowledge-dash connect-page">
      <header className="knowledge-dash__header">
        <h1 className="knowledge-dash__title">Connect WhatsApp</h1>
        <p className="knowledge-dash__subtitle">
          Link a WhatsApp Business account via Facebook to enable the AI agent.
        </p>
      </header>

      {error && (
        <p className="knowledge-dash__error" role="alert">
          {error}
        </p>
      )}
      {success && <p className="connect-page__success">{success}</p>}

      <section className="connect-page__section">
        {loading ? (
          <p className="knowledge-dash__muted">Loading...</p>
        ) : connections.length === 0 ? (
          <div className="connect-page__empty">
            <p className="knowledge-dash__muted">
              No WhatsApp account connected yet.
            </p>
            <button
              type="button"
              className="connect-page__btn"
              onClick={handleConnect}
              disabled={connecting}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 14.95 3.25 17.5 5.23 19.22L3.82 22L6.73 20.55C8.35 21.43 10.12 21.96 12 21.96C17.5 21.96 22 17.47 22 11.94C22 6.41 17.5 2.04 12 2.04Z" />
              </svg>
              {connecting ? "Connecting..." : "Connect WhatsApp Account"}
            </button>
          </div>
        ) : (
          <div className="connect-page__connections">
            {connections.map((c) => (
              <div key={c.id} className="connect-page__card">
                <div className="connect-page__card-info">
                  <span className="connect-page__card-dot" />
                  <div>
                    <p className="connect-page__card-name">
                      {c.display_name ?? "WhatsApp Business"}
                    </p>
                    <p className="connect-page__card-phone">
                      {c.display_phone_number ?? c.phone_number_id}
                    </p>
                    <p className="connect-page__card-meta">
                      WABA: {c.waba_id} &middot; Connected{" "}
                      {new Date(c.connected_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="knowledge-dash__btn knowledge-dash__btn--danger"
                  onClick={() => handleDisconnect(c.id)}
                >
                  Disconnect
                </button>
              </div>
            ))}
            <button
              type="button"
              className="connect-page__btn connect-page__btn--secondary"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? "Connecting..." : "Connect Another Account"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
