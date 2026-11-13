import bootstrap from "./src/bootstrap.js";



bootstrap().catch((error) => {
  console.error("Climate service failed to start:", error.message);
  process.exitCode = 1;
});
