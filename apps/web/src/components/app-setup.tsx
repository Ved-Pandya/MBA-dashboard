"use client";

import { usePwa } from "./pwa-provider";

export function GuidedAppSetupCard() {
  const { guidedCardVisible, installed, pushState, openSetup, dismissGuidedCard } = usePwa();
  if (!guidedCardVisible) return null;
  return (
    <section className="app-setup-card">
      <img src="/icons/icon-192.png" alt="" />
      <div><strong>{installed ? "Enable mobile alerts" : "Install DeadlineOS"}</strong><p>{installed ? "Receive deadline notifications even when the app is closed." : "Add DeadlineOS to your Home Screen for a full-screen app experience."}</p></div>
      <button className="primary-button" onClick={openSetup}>{pushState === "denied" ? "Fix settings" : "Set up"}</button>
      <button className="icon-button" onClick={dismissGuidedCard} aria-label="Dismiss app setup for seven days">x</button>
    </section>
  );
}

export function AppSetupPanel() {
  const { setupOpen, closeSetup, installed, ios, installAvailable, pushState, busy, error, install, enablePush, disablePush } = usePwa();
  if (!setupOpen) return null;
  return (
    <>
      <button className="drawer-backdrop" onClick={closeSetup} aria-label="Close app setup" />
      <aside className="notification-drawer app-setup-drawer open" aria-label="DeadlineOS app setup">
        <div className="drawer-head"><div><p className="eyebrow">MOBILE APP</p><h2>App setup</h2></div><button className="icon-button" onClick={closeSetup}>x</button></div>
        <div className="setup-progress">
          <article className={installed ? "setup-step complete" : "setup-step"}><span>1</span><div><strong>Install DeadlineOS</strong>{installed ? <p>Installed in standalone mode.</p> : ios ? <p>In Safari, tap Share, choose Add to Home Screen, turn on Open as Web App, then tap Add.</p> : installAvailable ? <p>Install the app directly from this browser.</p> : <p>Open your browser menu and choose Install app or Add to Home Screen.</p>}</div>{!installed && installAvailable && <button className="primary-button" onClick={() => void install()}>Install</button>}</article>
          <article className={pushState === "enabled" ? "setup-step complete" : "setup-step"}><span>2</span><div><strong>Enable notifications</strong>{pushState === "enabled" ? <p>This device is subscribed to DeadlineOS alerts.</p> : !installed ? <p>Finish installing DeadlineOS first, then open the Home Screen app to enable notifications.</p> : pushState === "denied" ? <p>Notifications are blocked. Enable them for DeadlineOS in your device or browser settings, then reopen this panel.</p> : pushState === "unsupported" ? <p>This browser does not support Web Push. On iPhone, install the app first and use iOS 16.4 or later.</p> : pushState === "unavailable" ? <p>Push keys have not been configured by the administrator yet.</p> : <p>Permission is requested only when you press the button.</p>}</div>{pushState === "enabled" ? <button className="secondary-button" onClick={() => void disablePush()} disabled={busy}>Disable</button> : <button className="primary-button" onClick={() => void enablePush()} disabled={busy || !installed || pushState === "denied" || pushState === "unsupported" || pushState === "unavailable"}>Enable</button>}</article>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="helper">Push delivery is best-effort. Your in-app notification inbox continues to work if notifications are disabled.</p>
      </aside>
    </>
  );
}
