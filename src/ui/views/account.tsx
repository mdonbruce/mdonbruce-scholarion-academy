import type { ReactNode } from "react";
import { Formats } from "../components/formats";
import type { Viewer } from "@/bff/views";
import { fmtDateTime } from "../components/cards";
import { AppShell, Flash, PrefsForm } from "../components/chrome";
import { t } from "@/i18n";

type V = NonNullable<Viewer>;
type FlashProps = { notice?: string; error?: string };
const h2 = { fontFamily: "var(--font-sans)", fontSize: "1.1rem" } as const;

function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#eef3ff,#f9f6ee)", padding: 16 }}>
      <div className="card card-pad" style={{ width: "min(440px,100%)", padding: 32 }}>
        <a href="/" style={{ display: "block", textAlign: "center" }}>
          <img src="/brand/scholarion-emblem.png" alt="Scholarion Academy" width={72} height={50} />
        </a>
        <h1 style={{ fontFamily: "var(--font-sans)", fontSize: "1.35rem", textAlign: "center", margin: "12px 0" }}>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function MfaView({ next, error, demoCode }: { next?: string; error?: string; demoCode: string | null }) {
  return (
    <AuthCard title="Two-step sign-in">
      <p className="small muted" style={{ textAlign: "center" }}>
        Enter the 6-digit code from your authenticator app.
      </p>
      <Flash error={error} />
      <form method="post" action="/api/v1/auth/mfa">
        <input type="hidden" name="redirect" value={next ?? "/app"} />
        <div className="field">
          <label htmlFor="code">Code</label>
          <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus style={{ letterSpacing: ".3em", fontSize: "1.3rem", textAlign: "center" }} />
        </div>
        <button className="btn btn-primary btn-block">Verify and sign in</button>
      </form>
      {demoCode && (
        <div className="dev-banner" style={{ marginTop: 14 }}>
          Development demo account — current code: <strong className="mono">{demoCode}</strong>
        </div>
      )}
      <p className="small" style={{ textAlign: "center", marginTop: 14 }}>
        <a href="/login">Start over</a> · Lost your device? <a href="/help?q=password">Contact support</a>
      </p>
    </AuthCard>
  );
}

export function ForgotView({ sent, error }: { sent: boolean; error?: string }) {
  return (
    <AuthCard title="Reset your password">
      {sent ? (
        <div className="notice notice-ok" role="status">
          If an account uses that email, we've sent a reset link. It works for 1 hour.
        </div>
      ) : (
        <>
          <p className="small muted" style={{ textAlign: "center" }}>
            Enter your email and we'll send you a link to choose a new password.
          </p>
          <Flash error={error} />
          <form method="post" action="/api/v1/auth/forgot">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <button className="btn btn-primary btn-block">Send reset link</button>
          </form>
        </>
      )}
      <p className="small" style={{ textAlign: "center", marginTop: 14 }}>
        <a href="/login">Back to sign in</a>
      </p>
    </AuthCard>
  );
}

export function ResetView({ token, error }: { token: string; error?: string }) {
  return (
    <AuthCard title="Choose a new password">
      <Flash error={error} />
      <form method="post" action="/api/v1/auth/reset">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="back" value={`/reset-password/${token}`} />
        <div className="field">
          <label htmlFor="password">
            New password <span className="hint">(at least 10 characters)</span>
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Repeat new password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <button className="btn btn-primary btn-block">Change password</button>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          You'll be signed out on all devices.
        </p>
      </form>
    </AuthCard>
  );
}

export function VerifyEmailView({ token, error }: { token: string; error?: string }) {
  return (
    <AuthCard title="Confirm your email">
      <Flash error={error} />
      <form method="post" action="/api/v1/auth/verify-email">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="back" value={`/verify-email/${token}`} />
        <button className="btn btn-primary btn-block">Confirm my email address</button>
      </form>
    </AuthCard>
  );
}

export interface SecurityVM {
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaEnabledAt: string | null;
  setup: { secret: string; otpauth: string; qrSvg: string } | null;
  sessions: { createdAt: string; current: boolean }[];
  required: boolean;
  passwordChangedAt: string | null;
}

export function SecurityView({ viewer, vm, flash }: { viewer: V; vm: SecurityVM; flash: FlashProps }) {
  return (
    <AppShell viewer={viewer} current="/app/security">
      <h1 className="page-title">Security & privacy</h1>
      <Flash {...flash} />
      {vm.required && !vm.mfaEnabled && (
        <div className="notice notice-warn" role="alert">
          Admin tools need two-step sign-in. Turn it on below to continue.
        </div>
      )}
      <div className="grid g2" style={{ alignItems: "start" }}>
        <section className="card card-pad stack" aria-labelledby="sec-email">
          <h2 id="sec-email" style={h2}>
            Email
          </h2>
          <p className="small" style={{ margin: 0 }}>
            {vm.email} {vm.emailVerified ? <span className="badge badge-green">Confirmed</span> : <span className="badge badge-amber">Not confirmed</span>}
          </p>
          {!vm.emailVerified && (
            <form method="post" action="/api/v1/me/verification/resend">
              <button className="btn btn-outline btn-sm">Send a new confirmation link</button>
            </form>
          )}
        </section>

        <section className="card card-pad stack" aria-labelledby="sec-mfa">
          <h2 id="sec-mfa" style={h2}>
            Two-step sign-in
          </h2>
          {vm.mfaEnabled ? (
            <>
              <p className="small" style={{ margin: 0 }}>
                <span className="badge badge-green">On</span> since {vm.mfaEnabledAt ? fmtDateTime(vm.mfaEnabledAt) : "—"}. You enter a code from your authenticator app when you sign in.
              </p>
              <details className="acc">
                <summary>Turn off two-step sign-in</summary>
                <form method="post" action="/api/v1/me/mfa/disable" className="stack" style={{ ["--gap" as string]: "8px" }}>
                  <label htmlFor="mfa-off-pw" className="small" style={{ margin: 0 }}>
                    Password
                  </label>
                  <input id="mfa-off-pw" name="password" type="password" autoComplete="current-password" required />
                  <label htmlFor="mfa-off-code" className="small" style={{ margin: 0 }}>
                    Current code
                  </label>
                  <input id="mfa-off-code" name="code" type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} required />
                  <button className="btn btn-danger btn-sm">Turn off</button>
                </form>
              </details>
            </>
          ) : vm.setup ? (
            <form method="post" action="/api/v1/me/mfa/confirm" className="stack" style={{ ["--gap" as string]: "10px" }}>
              <p className="small" style={{ margin: 0 }}>
                1. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).
              </p>
              <div style={{ width: 168, background: "#fff", padding: 8, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: vm.setup.qrSvg }} />
              <p className="tiny muted" style={{ margin: 0 }}>
                Can't scan? Enter this key: <span className="mono" style={{ wordBreak: "break-all" }}>{vm.setup.secret}</span>
              </p>
              <label htmlFor="mfa-code" className="small" style={{ margin: 0 }}>
                2. Enter the 6-digit code it shows
              </label>
              <input id="mfa-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required style={{ maxWidth: 180 }} />
              <div>
                <button className="btn btn-primary btn-sm">Turn on</button>
              </div>
            </form>
          ) : (
            <>
              <p className="small" style={{ margin: 0 }}>
                Protect your account with a code from your phone in addition to your password.
              </p>
              <form method="post" action="/api/v1/me/mfa/setup">
                <button className="btn btn-primary btn-sm">Set up two-step sign-in</button>
              </form>
            </>
          )}
        </section>

        <section className="card card-pad stack" aria-labelledby="sec-pw">
          <h2 id="sec-pw" style={h2}>
            Password
          </h2>
          {vm.passwordChangedAt && <p className="tiny muted" style={{ margin: 0 }}>Last changed {fmtDateTime(vm.passwordChangedAt)}</p>}
          <form method="post" action="/api/v1/me/password" className="stack" style={{ ["--gap" as string]: "8px" }}>
            <label htmlFor="pw-current" className="small" style={{ margin: 0 }}>
              Current password
            </label>
            <input id="pw-current" name="current" type="password" autoComplete="current-password" required />
            <label htmlFor="pw-next" className="small" style={{ margin: 0 }}>
              New password <span className="hint">(at least 10 characters)</span>
            </label>
            <input id="pw-next" name="next" type="password" autoComplete="new-password" minLength={10} required />
            <label htmlFor="pw-confirm" className="small" style={{ margin: 0 }}>
              Repeat new password
            </label>
            <input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
            <div>
              <button className="btn btn-outline btn-sm">Change password</button>
            </div>
          </form>
        </section>

        <section className="card card-pad stack" aria-labelledby="sec-sessions">
          <h2 id="sec-sessions" style={h2}>
            Signed-in devices
          </h2>
          <p className="small" style={{ margin: 0 }}>
            You're signed in on {vm.sessions.length} device{vm.sessions.length === 1 ? "" : "s"}.
          </p>
          <ul className="tiny muted" style={{ margin: 0, paddingLeft: 16 }}>
            {vm.sessions.map((s, i) => (
              <li key={i}>
                Since {fmtDateTime(s.createdAt)}
                {s.current ? " (this device)" : ""}
              </li>
            ))}
          </ul>
          <form method="post" action="/api/v1/me/sessions/revoke-all">
            <button className="btn btn-ghost btn-sm">Sign out everywhere</button>
          </form>
        </section>

        <section className="card card-pad stack" aria-labelledby="sec-prefs">
          <h2 id="sec-prefs" style={h2}>
            {t("prefs.language")} · {t("prefs.region")}
          </h2>
          <PrefsForm compact />
          <p className="tiny muted" style={{ margin: 0 }}>
            {t("prefs.note")} {t("prefs.priceNote")}
          </p>
        </section>

        <section className="card card-pad stack" aria-labelledby="sec-export">
          <h2 id="sec-export" style={h2}>
            Download your data
          </h2>
          <p className="small" style={{ margin: 0 }}>
            A JSON file with your account, learning records, grades, submissions, posts, credentials, orders and applications.
          </p>
          <div>
            <a className="btn btn-outline btn-sm" href="/api/v1/me/export">
              Download my data
            </a>
            <Formats href="/api/v1/me/export" name="My data" />
          </div>
        </section>

        <section className="card card-pad stack" aria-labelledby="sec-delete" style={{ borderColor: "var(--red-600)" }}>
          <h2 id="sec-delete" style={h2}>
            Delete your account
          </h2>
          <p className="small" style={{ margin: 0 }}>
            This cancels subscriptions, frees any organization seat, revokes your credentials and erases your personal data. Payment records are kept without your name for tax law. This can't be undone.
          </p>
          <details className="acc">
            <summary>Delete my account</summary>
            <form method="post" action="/api/v1/me/delete" className="stack" style={{ ["--gap" as string]: "8px" }}>
              <label htmlFor="del-pw" className="small" style={{ margin: 0 }}>
                Password
              </label>
              <input id="del-pw" name="password" type="password" autoComplete="current-password" required />
              <label htmlFor="del-confirm" className="small" style={{ margin: 0 }}>
                Type DELETE to confirm
              </label>
              <input id="del-confirm" name="confirm" type="text" required autoComplete="off" />
              <button className="btn btn-danger btn-sm">Delete my account permanently</button>
            </form>
          </details>
        </section>
      </div>
    </AppShell>
  );
}
