"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_MODEL } from "@/lib/whatsapp/aiModeSettings";

const OPENAI_CHAT_MODELS = [
  {
    id: "gpt-4o-mini",
    label: "Value",
    sublabel: "GPT-4o mini",
    desc: "Fast, reliable, and cost-effective. Great for high-volume conversations.",
  },
  {
    id: "gpt-4.1",
    label: "Balanced",
    sublabel: "GPT-4.1",
    desc: "Strong quality and reasoning at a moderate price. Best for most use cases.",
  },
  {
    id: "gpt-5-mini",
    label: "Premium",
    sublabel: "GPT-5 mini",
    desc: "Top-tier capability and nuance. Ideal when every reply needs to be spot-on.",
  },
];

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

export default function AIPage() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveModel = OPENAI_CHAT_MODELS.some((m) => m.id === model) ? model : DEFAULT_MODEL;

  const fetchSettings = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/admin/whatsapp/settings", {
        credentials: "include",
        headers: authHeaders,
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Failed to load settings");
        return;
      }
      const data = await res.json();
      const savedModel = typeof data.model === "string" ? data.model.trim() : DEFAULT_MODEL;
      const isKnown = OPENAI_CHAT_MODELS.some((m) => m.id === savedModel);
      setModel(isKnown ? savedModel : DEFAULT_MODEL);
      setSystemPrompt(typeof data.systemPrompt === "string" ? data.systemPrompt : "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/admin/whatsapp/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          model: effectiveModel,
          systemPrompt: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
        }),
      });
      if (!res.ok) {
        setError("Failed to save");
        return;
      }
      const data = await res.json();
      const savedModel = typeof data.model === "string" ? data.model.trim() : DEFAULT_MODEL;
      const isKnown = OPENAI_CHAT_MODELS.some((m) => m.id === savedModel);
      setModel(isKnown ? savedModel : DEFAULT_MODEL);
      setSystemPrompt(typeof data.systemPrompt === "string" ? data.systemPrompt : "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="knowledge-dash ai-page">
      <header className="knowledge-dash__header">
        <h1 className="knowledge-dash__title">AI</h1>
        <p className="knowledge-dash__subtitle">
          Choose the OpenAI chat model and system prompt for the WhatsApp assistant.
        </p>
      </header>

      <section className="knowledge-dash__form-section">
        {loading ? (
          <p className="knowledge-dash__muted">Loading...</p>
        ) : (
          <form onSubmit={handleSave} className="knowledge-dash__form">
            <span className="knowledge-dash__label">Model</span>
            <p className="knowledge-dash__muted ai-model-picker__hint">
              Pick the right balance of cost and quality for your conversations.
            </p>
            <div className="ai-model-picker">
              {OPENAI_CHAT_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  disabled={saving}
                  className={`ai-model-picker__card ${model === m.id ? "ai-model-picker__card--selected" : ""}`}
                >
                  <span className="ai-model-picker__name">{m.label}</span>
                  <span className="ai-model-picker__sublabel">{m.sublabel}</span>
                  <span className="ai-model-picker__desc">{m.desc}</span>
                </button>
              ))}
            </div>

            <label className="knowledge-dash__label" htmlFor="system-prompt">
              System prompt
            </label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={DEFAULT_SYSTEM_PROMPT}
              className="knowledge-dash__textarea"
              rows={10}
              disabled={saving}
            />
            {error && (
              <p className="knowledge-dash__error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="knowledge-dash__btn knowledge-dash__btn--primary"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
