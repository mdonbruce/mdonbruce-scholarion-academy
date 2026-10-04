import { notFound } from "next/navigation";

/** Degrees are PLANNED and hidden: no degree-granting partner agreements exist, so the route returns 404. */
export default function Page() {
  notFound();
}
