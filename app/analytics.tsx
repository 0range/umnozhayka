"use client";

import { useEffect, useState } from "react";

export const ANALYTICS_CONSENT_KEY = "umnozhayka-analytics-consent-v1";
export const APP_VERSION = "2026.08.24.1";
const METRIKA_ID = 111892328;

type AnalyticsValue = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsValue>;
type YmFunction = {
  (...args: unknown[]): void;
  a?: unknown[][];
  l?: number;
};

declare global {
  interface Window {
    ym?: YmFunction;
    __umnozhaykaMetrikaInitialized?: boolean;
  }
}

function metrikaId() {
  return METRIKA_ID;
}

export function analyticsConfigured() {
  return metrikaId() !== null;
}

export function getAnalyticsConsent() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "on";
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, enabled ? "on" : "off");
  } catch {
    // The game remains usable when storage is unavailable.
  }
  const id = metrikaId();
  if (id) {
    Reflect.set(window, `disableYaCounter${id}`, !enabled);
  }
  window.dispatchEvent(new CustomEvent("umnozhayka-analytics-consent", { detail: enabled }));
}

export function useAnalyticsConsent() {
  const [enabled, setEnabled] = useState(getAnalyticsConsent);

  useEffect(() => {
    const onChange = (event: Event) => {
      setEnabled(Boolean((event as CustomEvent<boolean>).detail));
    };
    window.addEventListener("umnozhayka-analytics-consent", onChange);
    return () => window.removeEventListener("umnozhayka-analytics-consent", onChange);
  }, []);

  return enabled;
}

export function trackAnalytics(event: string, params: AnalyticsParams = {}) {
  const id = metrikaId();
  if (!id || !getAnalyticsConsent() || !window.ym) return;
  window.ym(id, "reachGoal", event, {
    app_version: APP_VERSION,
    ...params,
  });
}

export function YandexMetrika() {
  const enabled = useAnalyticsConsent();

  useEffect(() => {
    const id = metrikaId();
    if (!id) return;

    const disableKey = `disableYaCounter${id}`;
    Reflect.set(window, disableKey, !enabled);
    if (!enabled || window.__umnozhaykaMetrikaInitialized) return;

    if (!window.ym) {
      const ym: YmFunction = (...args: unknown[]) => {
        ym.a = ym.a || [];
        ym.a.push(args);
      };
      ym.l = Date.now();
      window.ym = ym;
    }

    if (!document.querySelector('script[data-umnozhayka-metrika="true"]')) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://mc.yandex.ru/metrika/tag.js?id=${id}`;
      script.dataset.umnozhaykaMetrika = "true";
      document.head.appendChild(script);
    }

    window.ym(id, "init", {
      ssr: true,
      clickmap: false,
      trackLinks: false,
      accurateTrackBounce: true,
      webvisor: false,
    });
    window.__umnozhaykaMetrikaInitialized = true;
    window.ym(id, "reachGoal", "app_open", { app_version: APP_VERSION });

    const onError = () => trackAnalytics("app_error", { kind: "script" });
    const onRejection = () => trackAnalytics("app_error", { kind: "promise" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [enabled]);

  return null;
}
