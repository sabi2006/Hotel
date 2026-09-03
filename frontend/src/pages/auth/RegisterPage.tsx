import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Input, Select } from "@/components/Input";
import { HOME_ROUTE_BY_ROLE } from "@/context/auth-context";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/services/api";
import type { RegisterPayload } from "@/types";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  role: "WAITER" as RegisterPayload["role"],
};

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        role: form.role,
      });
      navigate(HOME_ROUTE_BY_ROLE[user.role], { replace: true });
    } catch (caught) {
      setError(getErrorMessage(caught, "Unable to create your account"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <h2 className="text-xl font-bold text-slate-900">Create staff account</h2>
        <p className="mt-1 text-sm text-slate-500">
          Waiter and kitchen accounts only. Admins are created from the admin panel.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Input
        label="Full name"
        required
        value={form.name}
        onChange={(event) => update("name", event.target.value)}
        placeholder="Ravi Kumar"
      />
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={form.email}
        onChange={(event) => update("email", event.target.value)}
        placeholder="you@restaurant.com"
      />
      <Input
        label="Phone"
        type="tel"
        value={form.phone}
        onChange={(event) => update("phone", event.target.value)}
        hint="Optional"
        placeholder="9876543210"
      />
      <Select
        label="Role"
        value={form.role}
        onChange={(event) => update("role", event.target.value as RegisterPayload["role"])}
      >
        <option value="WAITER">Waiter</option>
        <option value="KITCHEN">Kitchen staff</option>
      </Select>
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        value={form.password}
        onChange={(event) => update("password", event.target.value)}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        value={form.confirmPassword}
        onChange={(event) => update("confirmPassword", event.target.value)}
      />

      <Button type="submit" fullWidth isLoading={isSubmitting}>
        Create account
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
