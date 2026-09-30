import { FormEvent, useEffect, lazy, Suspense } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { applyRequested, approveRequested, jobsRequested, loginRequested, logoutRequested, type RootState, store } from "./store";
import { api, t } from "./api";

const AnalyticsPage = lazy(() => import("./AnalyticsPage"));

function Arrow() {
  return <span aria-hidden className="inline-block border-t-4 border-r-4 border-[var(--primary)] w-6 h-6 rotate-[-45deg]" />;
}

export function LoginForm() {
  const dispatch = useDispatch();
  const error = useSelector((state: RootState) => state.session.error);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    dispatch(loginRequested({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      tenantSlug: String(form.get("tenant") ?? "") || undefined,
    }));
  }
  return (
    <form onSubmit={onSubmit} className="max-w-md mx-auto mt-16 bg-[var(--card)] border border-[var(--border)] p-8 rounded-lg">
      <div className="flex justify-between items-start">
        <h1 className="text-4xl font-black text-[var(--primary)]">CAMPUS JOB PORTAL</h1>
        <Arrow />
      </div>
      <label className="block mt-6 text-sm">{t("email")}<input name="email" type="email" required className="mt-1 w-full border p-2 rounded" /></label>
      <label className="block mt-3 text-sm">{t("password")}<input name="password" type="password" required className="mt-1 w-full border p-2 rounded" /></label>
      <label className="block mt-3 text-sm">{t("tenant")}<input name="tenant" className="mt-1 w-full border p-2 rounded" /></label>
      {error ? <p role="alert" className="mt-3 text-[var(--danger)]">{error}</p> : null}
      <button type="submit" className="mt-6 bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded font-semibold">{t("signIn")}</button>
    </form>
  );
}

function Portal() {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.session.user);
  const items = useSelector((state: RootState) => state.jobs.items);
  const jobsError = useSelector((state: RootState) => state.jobs.error);
  useEffect(() => {
    if (!user?.tenantId) return;
    api("/theme").then((body: { theme?: { primary: string; background: string; foreground: string } | null }) => {
      if (!body.theme) return;
      document.documentElement.style.setProperty("--primary", body.theme.primary);
      document.documentElement.style.setProperty("--background", body.theme.background);
      document.documentElement.style.setProperty("--foreground", body.theme.foreground);
    }).catch(() => undefined);
    dispatch(jobsRequested());
  }, [dispatch, user]);
  if (!user) return <LoginForm />;
  const isTpo = user.roles.includes("tpo");
  const isStudent = user.roles.includes("student");
  return (
    <main className="p-8">
      <header className="flex justify-between items-center">
        <h1 className="text-4xl font-black text-[var(--primary)]">{isTpo ? t("approvals") : t("jobs")}</h1>
        <button type="button" onClick={() => dispatch(logoutRequested())}>Log out</button>
      </header>
      <p className="mt-2">{user.name}</p>
      {jobsError ? <p role="alert">{jobsError}</p> : null}
      <ul className="mt-6 space-y-3">
        {items.map((job) => (
          <li key={job.id} className="bg-[var(--card)] border border-[var(--border)] p-4 rounded flex justify-between">
            <span>{job.title} · {job.status}</span>
            {isTpo && job.status === "submitted" ? <button type="button" onClick={() => dispatch(approveRequested(job.id))}>{t("approve")}</button> : null}
            {isStudent && job.status === "approved" ? <button type="button" onClick={() => dispatch(applyRequested(job.id))}>{t("apply")}</button> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}

export function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Portal />} />
          <Route path="/analytics" element={<Suspense fallback={<p>Loading analytics</p>}><AnalyticsPage /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </Provider>
  );
}
