import React, { useEffect, useMemo, useState, useContext, createContext, useRef } from "react";
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
   Minimal themed toast system (same as before)
   ========================================================= */
const ToastCtx = createContext({ push: () => {}, remove: () => {} });

function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  function push({ title, description = "", variant = "info", duration = 3800 }) {
    const id = Math.random().toString(36).slice(2);
    setItems((arr) => [...arr, { id, title, description, variant }]);
    setTimeout(() => remove(id), duration);
    return id;
  }
  function remove(id) { setItems((arr) => arr.filter((t) => t.id !== id)); }
  return (
    <ToastCtx.Provider value={{ push, remove }}>
      {children}
      <ToastViewport items={items} onClose={remove} />
    </ToastCtx.Provider>
  );
}
function useToast() { return useContext(ToastCtx); }
function ToastViewport({ items, onClose }) {
  return (
    <>
      <style>{`@keyframes toast-in{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(100%,420px)] flex-col gap-2">
        {items.map((t) => {
          const palette =
            t.variant === "error" ? "border-red-500/40 bg-red-500/10"
            : t.variant === "success" ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-blue-500/40 bg-blue-500/10";
          return (
            <div key={t.id} className={`pointer-events-auto rounded-xl border p-4 shadow-lg backdrop-blur-sm ring-1 ring-black/5 animate-[toast-in_180ms_ease-out] ${palette}`} role="status">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-foreground/70" />
                <div className="min-w-0">
                  <div className="font-medium leading-5">{t.title}</div>
                  {t.description ? <div className="small text-muted-foreground mt-0.5 whitespace-pre-line">{t.description}</div> : null}
                </div>
                <button onClick={() => onClose(t.id)} className="ml-auto shrink-0 rounded-md border border-border/80 bg-background px-2 py-1 text-xs hover:bg-muted">Close</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* =========================================================
   Small helpers
   ========================================================= */
function initialsOf(user) {
  const f = (user?.firstName || "").trim();
  const l = (user?.lastName || "").trim();
  const e = (user?.email || "").trim();
  if (f || l) return `${(f[0] || "").toUpperCase()}${(l[0] || "").toUpperCase() || ""}` || (e[0] || "?").toUpperCase();
  return (e[0] || "?").toUpperCase();
}
function useClickAway(ref, onAway) {
  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onAway();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ref, onAway]);
}

/* =========================================================
   Avatar Dropdown + Profile Dialog
   ========================================================= */
function AvatarDropdown({ user, onLogout, onOpenProfile }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useClickAway(rootRef, () => setOpen(false));
  const label = initialsOf(user);

  return (
    <div ref={rootRef} className="relative">
      <button
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-input bg-muted text-sm font-semibold"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
      >
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-popover shadow-lg ring-1 ring-black/5 p-2"
        >
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Signed in as <span className="font-medium">{user?.email}</span>
          </div>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onOpenProfile(); }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition"
          >
            Profile
          </button>
          <div className="my-2 border-t border-border" />
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition text-red-600"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

function ProfileDialog({ open, onClose, user, onSave }) {
  const { push: toast } = useToast();
  const [firstName, setFirst] = useState(user?.firstName || "");
  const [lastName, setLast] = useState(user?.lastName || "");
  const [tz, setTz] = useState(user?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFirst(user?.firstName || "");
      setLast(user?.lastName || "");
      setTz(user?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    }
  }, [open, user]);

  async function save() {
    try {
      setSaving(true);
      const patch = { firstName: firstName.trim(), lastName: lastName.trim(), tz: tz.trim() };
      const updated = await api.updateMe(patch);
      await onSave(updated);
      toast({ title: "Profile updated", variant: "success" });
      onClose();
    } catch (e) {
      toast({ title: "Update failed", description: e?.message || "Please try again.", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center px-3">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-xl p-6 md:p-7">
          <div className="text-lg font-semibold mb-4">Your Profile</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First name</Label>
              <Input value={firstName} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Last name</Label>
              <Input value={lastName} onChange={(e) => setLast(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled />
              <div className="small text-muted-foreground">Email changes aren’t supported here.</div>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <div className="flex gap-2">
                <Input value={tz} onChange={(e) => setTz(e.target.value)} className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")}
                >
                  Use browser
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   App Shell
   ========================================================= */
export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("today");
  const [profileOpen, setProfileOpen] = useState(false);

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
        : await api.register(payload); // register expects { firstName,lastName,email,password,tz }
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

            {/* Avatar dropdown */}
            <div className="ml-2">
              <AvatarDropdown
                user={user}
                onLogout={logout}
                onOpenProfile={() => setProfileOpen(true)}
              />
            </div>
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

        <ProfileDialog
          open={!!profileOpen}
          onClose={() => setProfileOpen(false)}
          user={user}
          onSave={(u) => setUser(u)}
        />
      </div>
    </ToastProvider>
  );
}

/* =========================================================
   Auth Card (unchanged from your toast version)
   ========================================================= */

function AuthCard({ onAuth }) {
  const { push: toast } = useToast();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

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
    return Math.min(4, score);
  }
  const strength = strengthScore(password);
  const strengthLabel = strength <= 1 ? "Weak" : strength === 2 ? "Fair" : strength === 3 ? "Good" : "Strong";
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
        await onAuth({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, tz }, "register");
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
      toast({ title: "Reset link", description: "If the email exists, a reset URL was generated (check backend console in dev).", variant: "info" });
      setShowForgot(false);
    } catch (e) {
      const msg = e?.message || "Request failed.";
      setInlineError(msg);
      toast({ title: "Could not send reset", description: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }
  function onKeyDown(e) { if (e.key === "Enter" && !showForgot) doAuth(); }

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <style>{`.auth-input:-webkit-autofill,.auth-input:-webkit-autofill:hover,.auth-input:-webkit-autofill:focus{-webkit-box-shadow:0 0 0px 1000px hsl(var(--background)) inset!important;box-shadow:0 0 0px 1000px hsl(var(--background)) inset!important;-webkit-text-fill-color:hsl(var(--foreground))!important;caret-color:hsl(var(--foreground))!important}`}</style>
      <div className="card w-full max-w-md p-6 md:p-8 space-y-5" onKeyDown={onKeyDown}>
        <div className="space-y-1">
          <div className="text-2xl font-extrabold tracking-tight">Welcome to <span className="text-primary">RepFlow</span></div>
          <p className="small">Simple daily workout tracking — targets, sets, and streaks.</p>
        </div>

        {inlineError ? <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">{inlineError}</div> : null}

        {!showForgot ? (
          <>
            <div className="inline-flex h-10 items-center rounded-lg border border-input bg-muted px-1">
              <button type="button" onClick={() => setMode("login")} className={["px-3 py-1.5 rounded-md text-sm font-medium transition", mode === "login" ? "bg-background text-foreground shadow-sm border border-input" : "text-muted-foreground"].join(" ")}>Log in</button>
              <button type="button" onClick={() => setMode("register")} className={["px-3 py-1.5 rounded-md text-sm font-medium transition", mode === "register" ? "bg-background text-foreground shadow-sm border border-input" : "text-muted-foreground"].join(" ")}>Create account</button>
            </div>

            {mode === "register" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first">First name</Label>
                  <Input id="first" autoComplete="given-name" value={firstName} onChange={(e) => setFirst(e.target.value)} className={authInputClass} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last">Last name</Label>
                  <Input id="last" autoComplete="family-name" value={lastName} onChange={(e) => setLast(e.target.value)} className={authInputClass} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{mode === "register" ? "Email address" : "Email"}</Label>
              <Input id="email" type="email" placeholder="you@example.com" autoComplete={mode === "register" ? "email" : "username"} value={email} onChange={(e) => setEmail(e.target.value)} className={authInputClass} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={authInputClass} />
              {mode === "register" && (
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-[var(--secondary)] border border-border overflow-hidden">
                    <div className={["h-full transition-all", strength <= 1 ? "bg-red-500" : strength === 2 ? "bg-yellow-500" : strength === 3 ? "bg-green-500" : "bg-emerald-500"].join(" ")} style={{ width: `${(strength / 4) * 100}%` }} />
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

            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" placeholder="Match your password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authInputClass} />
                {confirm && confirm !== password && <div className="small text-red-600">Passwords do not match.</div>}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button className="flex-1 shadow-sm active:scale-[.99]" onClick={doAuth} disabled={loading || (mode === "register" && !canRegister)}>
                {loading ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}
              </Button>
              {mode === "login" && (
                <Button variant="outline" className="flex-1" onClick={() => setShowForgot(true)} disabled={loading}>
                  Forgot password
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">Reset email</Label>
              <Input id="resetEmail" type="email" placeholder="you@example.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className={authInputClass} />
            </div>
            <div className="flex gap-2">
              <Button onClick={doForgot} disabled={loading}>Send reset</Button>
              <Button variant="outline" onClick={() => setShowForgot(false)} disabled={loading}>Back</Button>
            </div>
          </div>
        )}

        <div className="small text-center text-muted-foreground">Be kind to your future self.</div>
      </div>
    </div>
  );
}