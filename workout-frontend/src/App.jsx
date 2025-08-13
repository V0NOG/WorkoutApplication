import React, { useEffect, useState } from "react";
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

  async function handleAuth(email, password, mode) {
    const res = mode === "login" ? await api.login(email, password) : await api.register(email, password);
    setToken(res.token);
    setUser(res.user);
  }
  function logout() {
    setToken("");
    setUser(null);
  }

  return (
    <div className="container">
      {user && (
        <header className="sticky top-0 z-10 flex items-center gap-4 py-4 backdrop-blur">
          <div className="text-xl font-extrabold">
            Workout<span className="text-primary">Flow</span>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="ml-2">
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex-1" />

          {/* Theme toggle in navbar */}
          <ThemeToggle />

          <div className="hidden sm:block small ml-3">{user?.email}</div>
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
  );
}

function AuthCard({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);

  async function doAuth(mode) {
    if (!email || !password || loading) return;
    try {
      setLoading(true);
      await onAuth(email, password, mode);
    } catch (e) {
      alert(e.message || "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  async function doForgot() {
    if (!resetEmail || loading) return;
    try {
      setLoading(true);
      await api.requestPasswordReset(resetEmail);
      alert("If the email exists, a reset link was generated (check backend console in dev).");
      setShowForgot(false);
    } catch (e) {
      alert(e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !showForgot) doAuth("login");
  }

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="card w-full max-w-md p-6 md:p-8 space-y-5" onKeyDown={onKeyDown}>
        <div className="space-y-1">
          <div className="text-2xl font-extrabold tracking-tight">
            Welcome to <span className="text-primary">WorkoutFlow</span>
          </div>
          <p className="small">Simple daily workout tracking — targets, sets, and streaks.</p>
        </div>

        {!showForgot ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border border-border bg-white text-zinc-900 dark:bg-[#0b1324] dark:text-zinc-100 placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border border-border bg-white text-zinc-900 dark:bg-[#0b1324] dark:text-zinc-100 placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary/50"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1 shadow-sm active:scale-[.99]" onClick={() => doAuth("login")} disabled={loading}>
                {loading ? "Please wait…" : "Log in"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => doAuth("register")}
                disabled={loading}
              >
                Create account
              </Button>
            </div>

            <button className="text-sm text-primary hover:underline" onClick={() => setShowForgot(true)}>
              Forgot password?
            </button>
          </div>
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
                className="border border-border bg-white text-zinc-900 dark:bg-[#0b1324] dark:text-zinc-100"
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