const envFile = process.env.ENV_FILE || '.env';
require('dotenv').config({ path: envFile });
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { router: authRouter } = require('./auth');
const apiRouter = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRouter);
app.use('/api', apiRouter);

app.listen(PORT, () => {
  const basePath = process.env.BASE_PATH || '';
  console.log(`Server running at http://localhost:${PORT}${basePath}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('Running in development mode - any email accepted, magic links logged to console');
  }
});
