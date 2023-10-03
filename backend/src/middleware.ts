import { Request, Response, NextFunction } from "express";

import env from "./env.js";

export const enforceAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authToken = req.headers["authorization"];

  if (!authToken || authToken !== env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Not authorized" });
  }

  next();
};
