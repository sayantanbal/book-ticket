import { Router } from "express";
import {
  bookLegacySeat,
  getLegacySeats,
} from "../controllers/legacyController.js";

const legacyRoutes = Router();

legacyRoutes.get("/seats", getLegacySeats);
legacyRoutes.put("/:id/:name", bookLegacySeat);

export default legacyRoutes;
