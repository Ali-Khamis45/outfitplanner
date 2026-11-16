import type { Metadata } from "next";
import { PlannerPage } from "../../components/planner/PlannerPage";
import "../wardrobe/wardrobe.css";
import "../planning.css";
export const metadata: Metadata = { title: "Planner | Virtual Wardrobe" };
export default function Page() { return <PlannerPage />; }
