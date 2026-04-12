import { useAuthStore } from "../modules/auth/store";
import { pinia } from "../stores";

export const bootstrapAuth = async () => {
  const authStore = useAuthStore(pinia);

  await authStore.restoreSession();
};
