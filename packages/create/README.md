# create-exwave

Create a Next.js or Vite app with Exwave Auth: sign-up, sign-in, email
verification and password reset, ready to run.

```sh
npm create exwave@latest my-app -- --template next --key exw_pk_…
```

- `--template next`: Next.js App Router. The session lives in an httpOnly
  cookie and Server Components read it.
- `--template vite`: React with Vite. The browser talks to Exwave Auth.
- `--key`: your platform's publishable key, from Nexus → Auth. Without one,
  the app uses `@exwave-nexus/auth-mock`, a local stand-in for Exwave Auth.

Leave out what you don't know and it asks. The screens are shadcn components
in `components/exwave/`: change them as you like.

Guide: https://www.exwave.net/docs/auth/get-started/
