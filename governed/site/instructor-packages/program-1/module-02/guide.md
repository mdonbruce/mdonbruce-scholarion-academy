# Instructor guide: Constrain tool permissions

Objective: O2: Construct and explain a bounded prototype for a multi-agent service desk.

Timing: 10-minute setup, 20-minute implementation, 20-minute challenge, 15-minute critique, 5-minute wrap-up.

Emphasize: An independent permission check at execution time

Common mistake: A friendly warning alone. Ask which assumption failed.

Worked interpretation: Tools create consequences beyond text. Use allowlists, validate arguments, separate reads from writes and require approval for consequential operations. Never present a tool error as success.

Discussion: post one failure and critique one peer with evidence.

Do not treat a rules simulation as a live model or production service. Review the claim against reproduced outputs.