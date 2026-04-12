import { closeSqlClient, verifyDatabaseConnection } from "./client";

const main = async (): Promise<void> => {
  try {
    await verifyDatabaseConnection();
    console.log("Database connection verified.");
  } finally {
    await closeSqlClient();
  }
};

await main();
