import "dotenv/config";
import { buildApp } from "./app.js";
import { pool } from "./db.js";
import { config } from "./config.js";

const app = await buildApp({ db: pool });

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => console.log(`Backend listening on :${config.port}`))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
