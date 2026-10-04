import { startGrpcServer } from "../src/campus/http/grpc";

/** Runs the internal Campus gRPC server (h2c) — `npm run campus:grpc`. */
const port = Number(process.env.CAMPUS_GRPC_PORT ?? 50051);
startGrpcServer(port).then(() => console.log(`Scholarion Campus gRPC listening on 127.0.0.1:${port} (scholarion.campus.v1.CampusService)`));
