import { Router } from "express";
import {
  bookLegacySeat,
  getLegacySeats,
} from "../controllers/legacyController.js";
import { protectLegacyBooking } from "../middleware/protectLegacyBooking.js";

const legacyRoutes = Router();

legacyRoutes.get("/seats", getLegacySeats);
legacyRoutes.put("/:id/:name", protectLegacyBooking, bookLegacySeat);

export default legacyRoutes;
