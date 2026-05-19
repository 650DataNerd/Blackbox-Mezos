const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const agent = meta.agent ? `[${meta.agent}] ` : "";
      const extra = Object.keys(meta).filter(k => k !== "agent").length
        ? " " + JSON.stringify(meta)
        : "";
      return `${timestamp} ${level} ${agent}${message}${extra}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

module.exports = { logger };
