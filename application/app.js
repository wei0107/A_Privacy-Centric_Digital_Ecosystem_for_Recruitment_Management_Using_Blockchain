const { connectDB } = require('./services/dbService');
//const { autoMatch } = require('./services/matchService');
require('dotenv').config({ path: './secrets/.env' });
const session = require('express-session');
const cors = require('cors');
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var app = express();

(async () => {
  // 先連線 MongoDB
  await connectDB();

})().catch(err => {
  console.error('❌ 無法連線資料庫，伺服器啟動中止', err);
  process.exit(1);
});

app.use(cors({
  origin: 'http://localhost:5173',   // 換成你的前端網址（比如 vite, react）
  credentials: true                 // 允許帶 cookie
}));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

var authRouter = require('./routes/auth');
app.use('/auth', authRouter); // 所以 register 的路徑是 POST /auth/register

var seekerRouter = require('./routes/seeker');
app.use('/seeker', seekerRouter);

var companyRouter = require('./routes/company');
app.use('/company', companyRouter); 

const matchRoutes = require('./routes/match');
app.use('/match', matchRoutes);

var interviewRouter = require('./routes/interview');
app.use('/interview', interviewRouter);

var arbitrationRouter = require('./routes/arbitration');
app.use('/arbitration', arbitrationRouter);

const didTestRoutes = require("./routes/didTestRoutes");
app.use("/test/did", didTestRoutes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
