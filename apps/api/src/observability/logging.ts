import type { Options } from "pino-http";
import { normalizeRequestId } from "./request-id";

export const loggerConfig = {
  pinoHttp: {
    genReqId: (req, res) => {
      const header = req.headers["x-request-id"];
      const id = normalizeRequestId(Array.isArray(header) ? header[0] : header);
      res.setHeader("x-request-id", id);
      return id;
    },
    redact: [
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers['set-cookie']",
    ],
    autoLogging: {
      ignore: (req) =>
        req.url === "/api/v1/health" ||
        req.url === "/api/v1/health/live" ||
        req.url === "/api/v1/health/ready",
    },
  },
} satisfies { pinoHttp: Options };
