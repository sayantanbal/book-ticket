import { Router } from "express";
import {
  serveHealth,
  serveEndpointTesterPage,
  serveHomePage,
} from "../controllers/pageController.js";

const pageRoutes = Router();

pageRoutes.get("/", serveHomePage);
pageRoutes.get("/endpoint-tester", serveEndpointTesterPage);
pageRoutes.get("/health", serveHealth);

export default pageRoutes;
