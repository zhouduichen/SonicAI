"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import * as ToastRadix from "@radix-ui/react-toast";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (title: string, opts?: { description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export const useToast = () => useContext(ToastContext);

const variantStyles: Record<ToastVariant, { bar: string; icon: string }> = {
  success: { bar: "bg-emerald-500", icon: "●" },
  error: { bar: "bg-red-500", icon: "▲" },
  warning: { bar: "bg-amber-500", icon: "!" },
  info: { bar: "bg-sky-500", icon: "●" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (title: string, opts?: { description?: string; variant?: ToastVariant }) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      setToasts((prev) => [...prev, { id, title, description: opts?.description, variant: opts?.variant || "info" }]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastRadix.Provider swipeDirection="right" duration={4000}>
        {children}
        {toasts.map((t) => {
          const s = variantStyles[t.variant];
          return (
            <ToastRadix.Root
              key={t.id}
              open
              onOpenChange={(open) => { if (!open) removeToast(t.id); }}
              className="group relative flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-xl data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[state=closed]:animate-slide-out data-[state=open]:animate-slide-in"
              style={{
                background: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
                maxWidth: 380,
              }}
            >
              <span className="mt-0.5 text-xs font-mono" style={{ color: s.bar }}>{s.icon}</span>
              <div className="flex-1 min-w-0">
                <ToastRadix.Title className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {t.title}
                </ToastRadix.Title>
                {t.description && (
                  <ToastRadix.Description className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                    {t.description}
                  </ToastRadix.Description>
                )}
              </div>
              <ToastRadix.Close className="text-xs opacity-50 hover:opacity-100 transition-opacity" style={{ color: "var(--text-tertiary)" }}>
                ×
              </ToastRadix.Close>
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full overflow-hidden opacity-30" style={{ background: "var(--bg-tertiary)" }}>
                <div className={`h-full ${s.bar} animate-toast-timer`} />
              </div>
            </ToastRadix.Root>
          );
        })}
        <ToastRadix.Viewport className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-full max-w-sm outline-none" />
      </ToastRadix.Provider>
    </ToastContext.Provider>
  );
}
