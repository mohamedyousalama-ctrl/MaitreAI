"use client";

// ============================================================================
// FbSdkLoader — loads the Facebook JS SDK exactly once per page lifecycle.
//
// Fires onReady() when FB.init() completes.
// Fires onError() if the script fails to load or times out (12 s).
//
// Designed for WhatsApp Embedded Signup in the onboarding wizard.
// Callers must NOT call FB.login() until onReady fires.
//
// ⚠️  VERIFY AGAINST LIVE META DOCS before going live:
//     - FB.init() `version` — we use "v19.0" to match the backend.
//       Update both here and in the backend route if Meta bumps the required version.
//     - sdk.js locale path (en_US) — fine for a developer-facing flow; restaurant
//       owners see Meta's own UI which is locale-aware on their end.
// ============================================================================

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    FB: {
      init: (params: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } | null }) => void,
        params: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit: () => void;
    __kvFbReady: boolean;
  }
}

interface FbSdkLoaderProps {
  appId: string;
  version?: string;
  onReady: () => void;
  onError: () => void;
}

/** Timeout in ms before we declare the SDK unavailable. */
const SDK_TIMEOUT_MS = 12_000;

/**
 * Invisible component. Mount once inside the WhatsApp step.
 * Uses refs for callbacks so they never become effect dependencies
 * (avoids re-triggering the load on every render).
 */
export function FbSdkLoader({
  appId,
  version = "v19.0",
  onReady,
  onError,
}: FbSdkLoaderProps) {
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  // Keep refs current without re-running the effect
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!appId) {
      onErrorRef.current();
      return;
    }

    // Already initialized in a previous render / step visit
    if (window.__kvFbReady) {
      onReadyRef.current();
      return;
    }

    let cancelled = false;
    const tid = setTimeout(() => {
      if (!cancelled) onErrorRef.current();
    }, SDK_TIMEOUT_MS);

    const doInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version });
      clearTimeout(tid);
      window.__kvFbReady = true;
      if (!cancelled) onReadyRef.current();
    };

    // SDK script already loaded (e.g. navigated back to the step)
    if (window.FB) {
      doInit();
      return () => {
        cancelled = true;
        clearTimeout(tid);
      };
    }

    // Chain fbAsyncInit in case something else set it first
    const prev = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      prev?.();
      doInit();
    };

    // Inject the script tag only once
    if (!document.getElementById("facebook-jssdk")) {
      const js = document.createElement("script");
      js.id = "facebook-jssdk";
      js.src = "https://connect.facebook.net/en_US/sdk.js";
      js.async = true;
      js.defer = true;
      js.onerror = () => {
        clearTimeout(tid);
        if (!cancelled) onErrorRef.current();
      };
      document.head.appendChild(js);
    }
    // If the tag exists but FB isn't ready yet, fbAsyncInit will fire when it does.

    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [appId, version]); // callbacks via refs — intentionally not deps

  return null;
}
