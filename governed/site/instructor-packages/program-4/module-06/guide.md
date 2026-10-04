# Instructor guide: Design independent quality gates

Objective: O1: Map decision boundaries and evidence requirements for a software delivery team.

Timing: 10-minute setup, 20-minute implementation, 20-minute challenge, 15-minute critique, 5-minute wrap-up.

Emphasize: Not without independent gates and authorization

Common mistake: Yes because it understands its output. Ask which assumption failed.

Worked interpretation: Fail visibly when required checks fail. Separate code authoring, review and deployment authorization. Do not let an automated reviewer approve its own unverified output.

Discussion: post one failure and critique one peer with evidence.

Do not treat a rules simulation as a live model or production service. Review the claim against reproduced outputs.