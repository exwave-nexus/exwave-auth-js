# create-exwave

Create a Next.js or Vite app with Exwave Auth: sign-up, sign-in, email
verification and password reset, ready to run.

```sh
npm create exwave@latest my-app -- --template next --key exw_pk_…
```

- `--template next`: Next.js App Router. The session lives in an httpOnly
  cookie and Server Components read it.
- `--template vite`: React with Vite. The browser talks to Exwave Auth.
- `--template next-shadcn`: the Next.js app built from shadcn/ui components
  and Tailwind, in Exwave's colors. The same app as `npx shadcn@latest create
  -t next -n my-app https://www.exwave.net/r/exwave-app.json`.
- `--key`: your platform's publishable key, from Nexus → Auth. Without one,
  the app uses `@exwave-nexus/auth-mock`, a local stand-in for Exwave Auth.

Leave out what you don't know and it asks. In `next` and `vite`, the screens
are plain React components in `components/exwave/`, styled by one CSS file
with Exwave's colors as variables; in `next-shadcn` they are shadcn/ui
components. Change them as you like. To add the shadcn/ui screens to an app
you already have, see <https://www.exwave.net/docs/auth/components/>.

Guide: https://www.exwave.net/docs/auth/get-started/
