import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missingVariables = [
  !supabaseUrl && "VITE_SUPABASE_URL",
  !supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
].filter(Boolean);

function createMissingConfigError() {
  return new Error(
    `Missing Supabase environment variable${missingVariables.length > 1 ? "s" : ""}: ${missingVariables.join(
      ", "
    )}. Add them to a Vite .env file or deployment environment.`
  );
}

function createDisabledQuery() {
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    insert: () => query,
    update: () => query,
    delete: () => query,
    single: () => query,
    then: (resolve, reject) =>
      Promise.resolve({ data: null, error: createMissingConfigError() }).then(resolve, reject),
  };

  return query;
}

function createDisabledSupabaseClient() {
  console.error(createMissingConfigError().message);

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: createMissingConfigError() }),
      signInWithPassword: async () => ({ data: null, error: createMissingConfigError() }),
      setSession: async () => ({ data: null, error: createMissingConfigError() }),
      signOut: async () => ({ error: createMissingConfigError() }),
      updateUser: async () => ({ data: null, error: createMissingConfigError() }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    functions: { invoke: async () => ({ data: null, error: createMissingConfigError() }) },
    from: () => createDisabledQuery(),
    channel: () => ({
      on: () => ({
        subscribe: () => null,
      }),
    }),
    removeChannel: () => {},
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: createMissingConfigError() }),
        remove: async () => ({ data: null, error: createMissingConfigError() }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };
}

export const supabase =
  missingVariables.length === 0
    ? createClient(supabaseUrl, supabaseAnonKey)
    : createDisabledSupabaseClient();
