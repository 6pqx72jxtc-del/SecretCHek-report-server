const app = require('./server');

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log('SecretChek server listening on port', PORT);
});
