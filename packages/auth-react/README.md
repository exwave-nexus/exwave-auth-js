# @exwave-nexus/auth-react

Exwave Auth for React: a provider that holds the session, and headless hooks
for sign-in, sign-up, email links, password reset and sign-out, for your own
markup. Built on [`@exwave-nexus/auth`](https://www.npmjs.com/package/@exwave-nexus/auth).

On Next.js, use [`@exwave-nexus/auth-nextjs`](https://www.npmjs.com/package/@exwave-nexus/auth-nextjs)
too: it wires this provider to the App Router and the session cookie.

Full guide: <https://www.exwave.net/docs/auth/react/>

```bash
npm install @exwave-nexus/auth @exwave-nexus/auth-react
```

Starting from scratch? `npm create exwave@latest` makes a Vite or Next.js app
with every screen already built.

## The provider

```tsx
import { ExwaveProvider } from "@exwave-nexus/auth-react";

<ExwaveProvider
  publishableKey={import.meta.env.VITE_EXWAVE_PUBLISHABLE_KEY}
  navigate={(to) => router.navigate(to)} // your router
>
  <App />
</ExwaveProvider>;
```

The browser then talks to Exwave Auth directly. To go through your server's
routes instead (the session in an httpOnly cookie), pass `api="/api/exwave"`
and the server's `initialState`, or your own client with `client`.

| Prop | Default | |
| --- | --- | --- |
| `navigate` | A full page load | How hooks and components move between pages |
| `paths` | `/sign-in`, `/sign-up`, `/verify`, `/forgot-password`, `/reset-password`, and `/` after signing in and out | Where your auth pages are |
| `messages` | English | Overrides of `defaultMessages` from `@exwave-nexus/auth/messages` |
| `onAuthChange` | | Called on sign-in and sign-out from this page or another tab (never for what the server reported) |

## Hooks

Each action has `run()`, which never throws, plus `pending`, `error` and
`message` (the error in words).

| Hook | For |
| --- | --- |
| `useExwave()` | `user`, `isSignedIn`, `isLoaded`, `signOutReason`, `navigate`, `paths`, `auth` |
| `useSignIn()` | Sign-in, and `unverifiedEmail` to offer a new link |
| `useResendVerification(email)` | Sends the verification link again |
| `useSignUp()` | Sign-up, then `step: "check_email"` with `resend` |
| `useEmailLink()` | The page an email link opens: verifies, or hands back the reset code |
| `usePasswordReset()` | `request` a link, then `confirm` the new password |
| `useSignOut()` | Sign out, here or `{ everywhere: true }` |
| `usePasswordCheck(password, policy)` | The platform's password rules, ticked off as the user types |
| `usePlatformConfig()` | The platform's settings, `null` while they load |
| `<SignedIn>`, `<SignedOut>` | Render once the session is known |

```tsx
import { useSignIn } from "@exwave-nexus/auth-react";

function SignIn() {
  const signIn = useSignIn();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        signIn.run({
          login: String(form.get("login")),
          password: String(form.get("password")),
        });
      }}
    >
      <input name="login" autoComplete="username" />
      <input name="password" type="password" autoComplete="current-password" />
      {signIn.message && <p role="alert">{signIn.message}</p>}
      <button disabled={signIn.pending}>Sign in</button>
    </form>
  );
}
```

## Ready-made screens

Sign-in, sign-up, verification and password reset screens built on these
hooks come two ways: plain React and CSS in the apps `npm create exwave`
makes, or shadcn/ui components:

```bash
npx shadcn@latest add https://www.exwave.net/r/auth-react.json
```

React is a peer dependency (19 or later). The package adds about 8 KB
min+gz, the core included.
