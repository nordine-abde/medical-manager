import { closeSqlClient } from "./client";
import { runMigrations } from "./migrator";

const main = async (): Promise<void> => {
  try {
    const appliedMigrations = await runMigrations();

    if (appliedMigrations.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    console.log(`Applied migrations: ${appliedMigrations.join(", ")}`);
  } finally {
    await closeSqlClient();
  }
};

await main();
