// 👇 ESTA LÍNEA ES LA MAGIA QUE FALTA
import "dotenv/config"; 

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve on PORT, falling back to next available port if in use
  const desiredPort = parseInt(process.env.PORT || '5000', 10);

  async function tryListen(startPort: number, maxAttempts = 5) {
    let attempt = 0;
    let currentPort = startPort;
    while (attempt < maxAttempts) {
      await new Promise<void>((resolve) => {
        server.once('error', (err: any) => {
          if (err?.code === 'EADDRINUSE') {
            log(`port ${currentPort} in use, trying ${currentPort + 1}`);
            currentPort += 1;
            attempt += 1;
            resolve();
          } else {
            throw err;
          }
        });

        server.listen({
          port: currentPort,
          host: "0.0.0.0",
          reusePort: true,
        }, () => {
          log(`serving on port ${currentPort}`);
          resolve();
        });
      });

      // Break if listening succeeded (no new 'error' fired)
      // A small delay ensures we don't loop immediately
      const isListening = (server as any).listening === true;
      if (isListening) return;
    }
    throw new Error(`Could not bind to a port starting at ${startPort}`);
  }

  await tryListen(desiredPort);
})();