import React, { useEffect, useMemo, useRef, useState, useContext, createContext } from "react";
import { api, setToken } from "./api";
import dayjs from "dayjs";
import Today from "./Today.jsx";
import Templates from "./Templates.jsx";
import Stats from "./Stats.jsx";
import { Button } from "./components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import ThemeToggle from "./components/ThemeToggle.jsx";

/* =========================================================
   Minimal themed toast system (provider + hook + viewport)
   ========================================================= */

const ToastCtx = createContext({ push: () => {}, remove: () => {} });

function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  function push({ title, description = "", variant = "info", duration = 3800 }) {
    const id = Math.random().toString(36).slice(2);
    const createdAt = Date.now();
    const t = { id, title, description, variant, createdAt };
    setItems((arr) => [...arr, t]);
    // auto-dismiss
    setTimeout(() => remove(id), duration);
    return id;
  }

  function remove(id) {
    setItems((arr) => arr.filter((t) => t.id !== id));
  }

  return (
    <ToastCtx.Provider value={{ push, remove }}>
      {children}
      <ToastViewport items={items} onClose={remove} />
    </ToastCtx.Provider>
  );
}
function useToast() {
  return useContext(ToastCtx);
}

function ToastViewport({ items, onClose }) {
  return (
    <>
      {/* small CSS helpers (scoped) for subtle in/out animation */}
      <style>{`
        @keyframes toast-in {
          from { transform: translateY(-8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(100%,420px)] flex-col gap-2">
        {items.map((t) => {
          const palette =
            t.variant === "error"
              ? "border-red-500/40 bg-red-500/10"
              : t.variant === "success"
              ? "border-emerald-500/40 bg-emerald-500/10"
              : "border-blue-500/40 bg-blue-500/10";
          return (
            <div
              key={t.id}
              className={[
                "pointer-events-auto rounded-xl border p-4 shadow-lg backdrop-blur-sm",
                "ring-1 ring-black/5",
                "animate-[toast-in_180ms_ease-out]",
                palette
              ].join(" ")}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-foreground/70" />
                <div className="min-w-0">
                  <div className="font-medium leading-5">{t.title}</div>
                  {t.description ? (
                    <div className="small text-muted-foreground mt-0.5 whitespace-pre-line">
                      {t.description}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onClose(t.id)}
                  className="ml-auto shrink-0 rounded-md border border-border/80 bg-background px-2 py-1 text-xs hover:bg-muted"
                  aria-label="Dismiss"
                >
                  Close
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* =========================================================
   App shell
   ========================================================= */

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("today");

  useEffect(() => {
    (async () => {
      const t = localStorage.getItem("token");
      if (!t) return;
      try {
        setUser(await api.me());
      } catch {
        setToken("");
        setUser(null);
      }
    })();
  }, []);

  async function handleAuth(payload, mode) {
    const res =
      mode === "login"
        ? await api.login(payload.email, payload.password)
        : await api.register(payload); // register expects object { firstName,lastName,email,password,tz }
    setToken(res.token);
    setUser(res.user);
  }
  function logout() {
    setToken("");
    setUser(null);
  }

  return (
    <ToastProvider>
      <div className="container">
        {user && (
          <header className="sticky top-0 z-10 flex items-center gap-4 py-4 backdrop-blur">
            <div className="text-xl font-extrabold">
              Rep<span className="text-primary">Flow</span>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="ml-2">
              <TabsList>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="templates">Templates</TabsTrigger>
                <TabsTrigger value="stats">Stats</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex-1" />

            <ThemeToggle />

            <div className="hidden sm:block small ml-3">
              {user?.firstName ? `Hi, ${user.firstName}` : user?.email}
            </div>
            <Button variant="outline" className="ml-1" onClick={logout}>
              Logout
            </Button>
          </header>
        )}

        {!user ? (
          <AuthCard onAuth={handleAuth} />
        ) : (
          <main className="stack mt-4">
            {tab === "today" && <Today />}
            {tab === "templates" && <Templates />}
            {tab === "stats" && <Stats />}
            <div className="small">Today: {dayjs().format("YYYY-MM-DD")}</div>
          </main>
        )}
      </div>
    </ToastProvider>
  );
}

/* =========================================================
   Auth Card (no window.alert; uses themed toasts)
   ========================================================= */

function AuthCard({ onAuth }) {
  const { push: toast } = useToast();
  const [mode, setMode] = useState("login"); // login | register

  // shared
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // register only
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [confirm, setConfirm] = useState("");

  // forgot password
  const [resetEmail, setResetEmail] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    []
  );

  const authInputClass = [
    "auth-input h-12 rounded-2xl",
    "border border-input bg-background text-foreground",
    "placeholder:text-muted-foreground",
    "shadow-sm",
    "focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
  ].join(" ");

  function strengthScore(pw) {
    let score = 0;
    const len = pw.length;
    const hasLower = /[a-z]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasNum = /\d/.test(pw);
    const hasSym = /[^A-Za-z0-9]/.test(pw);
    const kinds = [hasLower, hasUpper, hasNum, hasSym].filter(Boolean).length;

    if (len >= 8) score++;
    if (len >= 12) score++;
    if (kinds >= 2) score++;
    if (kinds >= 3) score++;

    return Math.min(4, score); // 0..4
  }
  const strength = strengthScore(password);
  const strengthLabel =
    strength <= 1 ? "Weak" : strength === 2 ? "Fair" : strength === 3 ? "Good" : "Strong";
  const strengthPct = (strength / 4) * 100;

  const canRegister =
    mode === "register" &&
    firstName.trim() &&
    lastName.trim() &&
    email.includes("@") &&
    password.length >= 8 &&
    confirm === password &&
    strength >= 2;

  async function doAuth() {
    if (loading) return;
    setInlineError("");
    try {
      setLoading(true);
      if (mode === "login") {
        if (!email || !password) throw new Error("Enter email and password.");
        await onAuth({ email, password }, "login");
        toast({ title: "Welcome back!", description: "You’re now signed in.", variant: "success" });
      } else {
        if (!canRegister) throw new Error("Please complete all fields and meet password requirements.");
        await onAuth(
          { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, tz },
          "register"
        );
        toast({ title: "Account created", description: `Hi ${firstName}!`, variant: "success" });
      }
    } catch (e) {
      const msg = e?.message || "Something went wrong.";
      setInlineError(msg);
      toast({ title: mode === "login" ? "Sign-in failed" : "Could not create account", description: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function doForgot() {
    if (!resetEmail || loading) return;
    setInlineError("");
    try {
      setLoading(true);
      await api.requestPasswordReset(resetEmail);
      toast({
        title: "Reset link",
        description: "If the email exists, a reset URL was generated (check backend console in dev).",
        variant: "info"
      });
      setShowForgot(false);
    } catch (e) {
      const msg = e?.message || "Request failed.";
      setInlineError(msg);
      toast({ title: "Could not send reset", description: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !showForgot) doAuth();
  }

  return (
    <div className="min-h-[70vh] grid place-items-center">
      {/* Autofill theme-aware override using your CSS variables */}
      <style>{`
        .auth-input:-webkit-autofill,
        .auth-input:-webkit-autofill:hover,
        .auth-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0px 1000px hsl(var(--background)) inset !important;
                  box-shadow: 0 0 0px 1000px hsl(var(--background)) inset !important;
          -webkit-text-fill-color: hsl(var(--foreground)) !important;
          caret-color: hsl(var(--foreground)) !important;
        }
      `}</style>

      <div className="card w-full max-w-md p-6 md:p-8 space-y-5" onKeyDown={onKeyDown}>
        <div className="space-y-1">
          <div className="text-2xl font-extrabold tracking-tight">
            Welcome to <span className="text-primary">RepFlow</span>
          </div>
          <p className="small">Simple daily workout tracking — targets, sets, and streaks.</p>
        </div>

        {/* Inline error banner (styled) */}
        {inlineError ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
            {inlineError}
          </div>
        ) : null}

        {!showForgot ? (
          <>
            {/* Mode switch */}
            <div className="inline-flex h-10 items-center rounded-lg border border-input bg-muted px-1">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={[
                  "px-3 py-1.5 rounded-md text-sm font-medium transition",
                  mode === "login" ? "bg-background text-foreground shadow-sm border border-input" : "text-muted-foreground"
                ].join(" ")}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={[
                  "px-3 py-1.5 rounded-md text-sm font-medium transition",
                  mode === "register" ? "bg-background text-foreground shadow-sm border border-input" : "text-muted-foreground"
                ].join(" ")}
              >
                Create account
              </button>
            </div>

            {/* Register-only: names */}
            {mode === "register" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first">First name</Label>
                  <Input
                    id="first"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirst(e.target.value)}
                    className={authInputClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last">Last name</Label>
                  <Input
                    id="last"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLast(e.target.value)}
                    className={authInputClass}
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">{mode === "register" ? "Email address" : "Email"}</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete={mode === "register" ? "email" : "username"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={authInputClass}
              />
            </div>

            {/* Password + strength */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={authInputClass}
              />

              {mode === "register" && (
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-[var(--secondary)] border border-border overflow-hidden">
                    <div
                      className={[
                        "h-full transition-all",
                        strength <= 1 ? "bg-red-500" : strength === 2 ? "bg-yellow-500" : strength === 3 ? "bg-green-500" : "bg-emerald-500"
                      ].join(" ")}
                      style={{ width: `${strengthPct}%` }}
                    />
                  </div>
                  <div className="small text-muted-foreground">
                    Strength: <span className="font-medium">{strengthLabel}</span>{" "}
                    <span className="opacity-80">
                      {password.length < 8 ? "• Use 8+ characters. " : ""}
                      {!/[A-Z]/.test(password) ? "• Add uppercase. " : ""}
                      {!/\d/.test(password) ? "• Add a number. " : ""}
                      {!/[^A-Za-z0-9]/.test(password) ? "• Add a symbol. " : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm (register only) */}
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Match your password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={authInputClass}
                />
                {confirm && confirm !== password && (
                  <div className="small text-red-600">Passwords do not match.</div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 shadow-sm active:scale-[.99]"
                onClick={doAuth}
                disabled={loading || (mode === "register" && !canRegister)}
              >
                {loading ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}
              </Button>
              {mode === "login" && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowForgot(true)}
                  disabled={loading}
                >
                  Forgot password
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">Reset email</Label>
              <Input
                id="resetEmail"
                type="email"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className={authInputClass}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={doForgot} disabled={loading}>
                Send reset
              </Button>
              <Button variant="outline" onClick={() => setShowForgot(false)} disabled={loading}>
                Back
              </Button>
            </div>
          </div>
        )}

        <div className="small text-center text-muted-foreground">Be kind to your future self.</div>
      </div>
    </div>
  );
}