const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const { CLIENT_URLS, isTest } = require('./config/env');
const sanitize = require('./middleware/sanitize');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.disable('x-powered-by');
app.use(
  helmet({
    // The React app (another port) is allowed to load the authenticated ID card image.
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);
app.use(
  cors({
    origin(origin, cb) {
      // allow tools without an Origin header (Postman, curl, same-origin requests)
      if (!origin || CLIENT_URLS.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true, // needed so the browser sends the httpOnly login cookie
  })
);
if (!isTest) app.use(morgan('dev'));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(sanitize);

app.use('/api', apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
