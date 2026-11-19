import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../App";
import { ReceiptText } from "lucide-react";

export default function Login() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const submit = async (e) => {
    e.preventEvent?.();
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/auth/login/", form);
      localStorage.setItem("access", data.access);
      localStorage.setItem("refresh", data.refresh);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      navigate("/");
    } catch (err) {
      if (!err.response) {
        setError("Cannot reach the API. Check that the backend is running and CORS allows this frontend URL.");
      } else if (err.response.status === 401) {
        setError("Invalid username or password.");
      } else {
        setError(err.response.data?.detail || "Sign-in failed. Please try again.");
      }
    } finally { setLoading(false); }
  };
  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><ReceiptText/><b>PayFlow AP</b></div>
        <h1>Welcome back</h1><p>Sign in to your accounts payable workspace</p>
        {error && <div className="alert error">{error}</div>}
        <label>Username<input value={form.username} onChange={e=>setForm({...form, username:e.target.value})} required /></label>
        <label>Password<input type="password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} required /></label>
        <button className="primary" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
      </form>
    </div>
  );
}
