"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { get, put, del } from "@/lib/api";
import type { UserPreferences } from "@/lib/types";
import { LoadingSpinner, SkeletonBlock } from "@/components/ui/LoadingSpinner";
import { QueryError } from "@/components/ui/ErrorBoundary";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Save, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";

const PrefsSchema = z.object({
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
  default_capital: z.number().min(100).max(1_000_000_000),
  currency: z.enum(["EUR", "USD", "GBP", "CHF", "JPY"]),
  chart_template: z.enum(["plotly_dark", "plotly", "ggplot2", "seaborn"]),
  decimals: z.number().int().min(0).max(6),
  ui_density: z.enum(["Compact", "Normal", "Spacious"]),
});

type PrefsForm = z.infer<typeof PrefsSchema>;

export default function SettingsPage() {
  const qc = useQueryClient();

  const prefs = useQuery<UserPreferences>({
    queryKey: ["user-prefs"],
    queryFn: () => get("/settings/preferences"),
    staleTime: Infinity,
  });

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<PrefsForm>({
    resolver: zodResolver(PrefsSchema),
    defaultValues: {
      accent_color: "#3B82F6",
      default_capital: 20000,
      currency: "EUR",
      chart_template: "plotly_dark",
      decimals: 2,
      ui_density: "Normal",
    },
  });

  useEffect(() => {
    if (prefs.data) reset(prefs.data as PrefsForm);
  }, [prefs.data, reset]);

  const save = useMutation({
    mutationFn: (data: PrefsForm) => put("/settings/preferences", data),
    onSuccess: () => {
      toast.success("Preferences saved.");
      qc.invalidateQueries({ queryKey: ["user-prefs"] });
    },
    onError: () => toast.error("Failed to save preferences."),
  });

  const resetPrefs = useMutation({
    mutationFn: () => del("/settings/preferences"),
    onSuccess: () => {
      toast.success("Preferences reset to defaults.");
      qc.invalidateQueries({ queryKey: ["user-prefs"] });
    },
    onError: () => toast.error("Failed to reset preferences."),
  });

  return (
    <ErrorBoundary>
      <div className="space-y-5 fade-in max-w-2xl">
        <h1 className="text-text-primary text-sm font-semibold tracking-widest uppercase">
          System Settings
        </h1>

        {prefs.isLoading ? (
          <div className="space-y-3">
            {[0,1,2,3].map((i) => <SkeletonBlock key={i} className="h-12" />)}
          </div>
        ) : prefs.error ? (
          <QueryError error={prefs.error as Error} onRetry={() => prefs.refetch()} />
        ) : (
          <form onSubmit={handleSubmit((d) => save.mutate(d))} className="space-y-4">
            {/* UI Preferences */}
            <Section title="INTERFACE">
              <FormRow label="UI Density">
                <select {...register("ui_density")} className="input-field">
                  <option value="Compact">Compact</option>
                  <option value="Normal">Normal</option>
                  <option value="Spacious">Spacious</option>
                </select>
              </FormRow>

              <FormRow label="Accent Color" error={errors.accent_color?.message}>
                <div className="flex items-center gap-2">
                  <input
                    {...register("accent_color")}
                    type="color"
                    className="w-8 h-8 bg-bg-tertiary border border-bg-border cursor-pointer rounded"
                  />
                  <input
                    {...register("accent_color")}
                    type="text"
                    className="flex-1 input-field uppercase"
                    placeholder="#3B82F6"
                  />
                </div>
              </FormRow>

              <FormRow label="Chart Template">
                <select {...register("chart_template")} className="input-field">
                  <option value="plotly_dark">Plotly Dark</option>
                  <option value="plotly">Plotly Light</option>
                  <option value="ggplot2">ggplot2</option>
                  <option value="seaborn">Seaborn</option>
                </select>
              </FormRow>

              <FormRow label="Decimal Places" error={errors.decimals?.message}>
                <select {...register("decimals", { valueAsNumber: true })} className="input-field">
                  {[0,1,2,3,4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </FormRow>
            </Section>

            {/* Financial preferences */}
            <Section title="FINANCIAL DEFAULTS">
              <FormRow label="Default Capital" error={errors.default_capital?.message}>
                <input
                  {...register("default_capital", { valueAsNumber: true })}
                  type="number"
                  step={1000}
                  className="input-field"
                />
              </FormRow>

              <FormRow label="Display Currency">
                <select {...register("currency")} className="input-field">
                  <option value="EUR">EUR — Euro</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="CHF">CHF — Swiss Franc</option>
                  <option value="JPY">JPY — Japanese Yen</option>
                </select>
              </FormRow>
            </Section>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={save.isPending || !isDirty}
                className="flex items-center gap-2 px-5 py-2 bg-accent-blue hover:bg-orange-600 text-white text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {save.isPending ? <LoadingSpinner size="sm" /> : <Save size={12} />}
                {save.isPending ? "SAVING..." : "SAVE PREFERENCES"}
              </button>

              <button
                type="button"
                onClick={() => resetPrefs.mutate()}
                disabled={resetPrefs.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary border border-bg-border hover:border-accent-blue text-text-secondary hover:text-text-primary text-xs transition-colors disabled:opacity-50"
              >
                <RotateCcw size={12} />
                RESET DEFAULTS
              </button>
            </div>
          </form>
        )}

        {/* API info */}
        <div className="bg-bg-secondary border border-bg-border p-4 mt-6">
          <div className="text-text-secondary text-xs uppercase tracking-widest mb-3">API KEYS — SERVER-SIDE ONLY</div>
          <p className="text-text-muted text-xs leading-relaxed">
            API keys (ALPHA_VANTAGE_API_KEY, FRED_API_KEY, JWT_SECRET_KEY) are configured
            as environment variables on the server. They are never exposed to the frontend.
            Edit <code className="bg-bg-tertiary px-1 py-0.5 text-accent-blue">.env</code> in the project root.
          </p>
          <div className="mt-3 space-y-1">
            {["ALPHA_VANTAGE_API_KEY", "FRED_API_KEY", "JWT_SECRET_KEY", "ALLOWED_ORIGINS"].map((key) => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <code className="text-accent-orange">{key}</code>
                <span className="text-text-muted">— configured in .env</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-secondary border border-bg-border p-4 space-y-3">
      <div className="text-text-secondary text-xs uppercase tracking-widest pb-2 border-b border-bg-border">{title}</div>
      {children}
    </div>
  );
}

function FormRow({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="flex items-start gap-4">
      <label className="text-text-secondary text-xs w-36 flex-shrink-0 pt-1.5">{label}</label>
      <div className="flex-1">
        {children}
        {error && <p className="text-accent-red text-xs mt-1">{error}</p>}
      </div>
    </div>
  );
}
