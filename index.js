// index.js
import app from "./server.js";

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("SecretChek server listening on port", PORT);
});
