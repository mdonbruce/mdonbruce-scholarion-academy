import "./login.css";

type Props =
  | { mode: "signin"; signInHref: string; environment: string; next?: string }
  | { mode: "ready"; displayName: string; email: string; continueHref: string; switchHref: string; environment: string }
  | { mode: "denied"; email: string; signOutHref: string; environment: string };

/** Sign-in and access screens shown before the HavenConnect workspace. Server-rendered; no client script. */
export function LoginScreen(props: Props) {
  const staging = props.environment !== "production";
  return <main className="hc-login">
    <section className="hc-login-brand">
      <p className="hc-login-kicker"><span className="hc-login-live" /> HAVEN DIGITAL SYSTEMS / AGENTIC AI</p>
      <h2>One control plane for every conversation.</h2>
      <p className="hc-login-description">Work across product rooms, coordinate specialist agents, and bring approvals and evidence into the same operational view.</p>
      <div className="hc-login-personas" aria-label="Specialist agent personas">
        <div><span>A</span><b>Alex</b><small>Finance &amp; higher education</small></div>
        <div><span>A</span><b>Amara</b><small>Official voice · hospitality, admissions &amp; Live Sync</small></div>
        <div><span>K</span><b>Kyle</b><small>Technical resolution</small></div>
      </div>
      <p className="hc-login-caption">Sessions · Autoflows · Knowledge · Insights · Governance</p>
    </section>
    <section className="hc-login-panel">
      <div className="hc-login-card">
        {staging && <span className="hc-login-env">Staging environment · test data only</span>}
        <div className="hc-login-wordmark"><span>H</span><div><h1>HavenConnect</h1><small>AGENTIC AI WORKSPACE</small></div></div>
        {props.mode === "signin" ? <>
          <p className="hc-login-lead">Sign in to open the new HavenConnect control plane.</p>
          <a className="hc-login-btn" href={props.signInHref} target="_top">Sign in with ChatGPT</a>
          <p className="hc-login-help">Use an authorized Oak Haven staff or administrator account. Invited product teams can enter the rooms assigned to them.</p>
        </> : props.mode === "ready" ? <>
          <p className="hc-login-lead">Welcome, {props.displayName}.</p>
          <p className="hc-login-who">Signed in as <b>{props.email}</b></p>
          <a className="hc-login-btn" href={props.continueHref} target="_top">Enter HavenConnect</a>
          <a className="hc-login-switch" href={props.switchHref} target="_top">Use another account</a>
          <p className="hc-login-help">Your ChatGPT sign-in verifies your identity. HavenConnect opens the product rooms assigned to your account.</p>
        </> : <>
          <p className="hc-login-lead">This account doesn&apos;t have access to HavenConnect.</p>
          <p className="hc-login-who">Signed in as <b>{props.email}</b></p>
          <a className="hc-login-btn" href={props.signOutHref} target="_top">Sign out and use another account</a>
          <p className="hc-login-help">Oak Haven staff use an authorized account. Product teams can ask a HavenConnect administrator to add their email to a room.</p>
        </>}
        <footer><span>Protected sign-in</span><span>Role-scoped access</span></footer>
      </div>
    </section>
  </main>;
}
