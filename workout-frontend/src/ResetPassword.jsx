import React, { useState } from "react";
import { api } from "./api";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

export default function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');

  async function submit() {
    if (!token || !password) return alert('Missing token or password');
    try {
      await api.resetPassword(token, password);
      alert('Password updated. Please log in.');
      window.location.href = '/';
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="card p-6 w-full max-w-md space-y-4">
        <div className="text-xl font-bold">Set a new password</div>
        <Input type="password" placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)} />
        <Button onClick={submit}>Update password</Button>
      </div>
    </div>
  );
}