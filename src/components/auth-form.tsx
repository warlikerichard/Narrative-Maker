"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Boxes, Compass, Layers3, Sparkles } from "lucide-react";
import { authenticate } from "@/app/actions";

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand" href="/">
          {" "}
          <span className="brand-icon">
            <Boxes size={24} />
          </span>
          <span>
            Narrative<span className="brand-light">Maker</span>
            <small>WORLD BUILDING WORKSPACE</small>
          </span>
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow">
            <Sparkles size={15} /> FOR THE WORLDS YET TO EXIST
          </span>
          <h1>
            Great games begin
            <br />
            with a <em>great story.</em>
          </h1>
          <p>
            Give your characters a home, your worlds a history,
            <br className="desktop-only" /> and your next big idea a place to
            grow.
          </p>
          <div className="auth-chips">
            <span>
              <Compass size={16} /> Build your universe
            </span>
            <span>
              <Layers3 size={16} /> Connect your ideas
            </span>
          </div>
        </div>
        <div className="auth-caption">
          <span className="tiny-dot" /> YOUR NEXT ADVENTURE STARTS HERE{" "}
          <span>EST. IN YOUR IMAGINATION</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <span className="eyebrow">YOUR CREATIVE HEADQUARTERS</span>
          <h2>
            {mode === "login"
              ? "Welcome back, creator."
              : "Make room for your ideas."}
          </h2>
          <p>
            {mode === "login"
              ? "Sign in and pick up where your imagination left off."
              : "Create your account and start building your first world."}
          </p>
          <AuthFields key={mode} mode={mode} />
          <p className="auth-switch">
            {mode === "login"
              ? "New to Narrative Maker?"
              : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <div className="auth-note">
            <span className="tiny-dot" /> A little structure. Endless
            possibilities.
          </div>
        </div>
      </section>
    </main>
  );
}

function AuthFields({ mode }: { mode: "login" | "register" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, action, pending] = useActionState(
    authenticate.bind(null, mode),
    {},
  );
  return (
    <form action={action} className="form-stack">
      {mode === "register" && (
        <label>
          Your name
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="What should we call you?"
            required
            maxLength={100}
          />
        </label>
      )}
      <label>
        Email address
        <input
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@yourstudio.com"
          required
          maxLength={254}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={
            mode === "register"
              ? "At least 10 characters"
              : "Enter your password"
          }
          required
          minLength={mode === "register" ? 10 : 1}
          maxLength={128}
        />
      </label>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      <button className="button primary auth-submit" disabled={pending}>
        {pending
          ? "Opening your workspace…"
          : mode === "login"
            ? "Enter workspace"
            : "Create account"}
        <ArrowRight size={17} />
      </button>
    </form>
  );
}
