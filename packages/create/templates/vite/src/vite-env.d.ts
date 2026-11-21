/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `exw_pk_…`, from Nexus → Auth. */
  readonly VITE_EXWAVE_PUBLISHABLE_KEY: string;
}
