# Instructor guide: Define tool contracts

Objective: O1: Map decision boundaries and evidence requirements for a multi-agent service desk.

Timing: 10-minute setup, 20-minute implementation, 20-minute challenge, 15-minute critique, 5-minute wrap-up.

Emphasize: No; permissions need separate enforcement

Common mistake: Yes; compatible tools can access everything. Ask which assumption failed.

Worked interpretation: Interoperability requires stable names, arguments, results and errors. A protocol transports requests but does not make content trustworthy. Version the contract and test invalid inputs.

Discussion: post one failure and critique one peer with evidence.

Do not treat a rules simulation as a live model or production service. Review the claim against reproduced outputs.