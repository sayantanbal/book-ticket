import { Router } from "express";
import {
  createBooking,
  getMovieSeats,
  getMovies,
  getMyBookings,
} from "../controllers/movieController.js";
import { authenticate } from "../middleware/authenticate.js";

const movieRoutes = Router();

movieRoutes.get("/movies", getMovies);
movieRoutes.get("/movies/:movieId/seats", getMovieSeats);
movieRoutes.post("/movies/:movieId/bookings", authenticate, createBooking);
movieRoutes.get("/me/bookings", authenticate, getMyBookings);

export default movieRoutes;
