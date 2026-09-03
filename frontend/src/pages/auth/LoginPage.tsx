import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { HOME_ROUTE_BY_ROLE } from "@/context/auth-context";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/services/api";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await login({ email: email.trim(), password });
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
      navigate(from ?? HOME_ROUTE_BY_ROLE[user.role], { replace: true });
    } catch (caught) {
      setError(getErrorMessage(caught, "Unable to sign in"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
        <p className="mt-1 text-sm text-slate-500">Use your staff account to continue.</p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@restaurant.com"
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      <Button type="submit" fullWidth isLoading={isSubmitting}>
        Sign in
      </Button>

      <p className="text-center text-sm text-slate-500">
        New staff member?{" "}
        <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          Create an account
        </Link>
      </p>
    </form>
  );
}
