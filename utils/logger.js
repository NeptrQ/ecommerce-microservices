const fs = require('fs');
const path = require('path');

const logDirectory = process.env.LOG_DIR;

if (logDirectory) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const requestLogger = (serviceName) => (req, res, next) => {
  const startedAt = Date.now();

  res.once('finish', () => {
    const entry = `${new Date().toISOString()} ${serviceName} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - startedAt}ms\n`;
    console.log(entry.trimEnd());

    if (logDirectory) {
      fs.appendFile(path.join(logDirectory, `${serviceName}.log`), entry, (err) => {
        if (err) {
          console.error(`Failed to write ${serviceName} log:`, err.message);
        }
      });
    }
  });

  next();
};

module.exports = requestLogger;
