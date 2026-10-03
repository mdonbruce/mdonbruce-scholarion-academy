/** Deletes persisted mock-platform state (.data/db.json). The next server start re-seeds. */
import { resetPersisted } from "../src/platform/store";

resetPersisted();
console.log("Cleared .data/db.json — restart the dev server to re-seed demo data.");
