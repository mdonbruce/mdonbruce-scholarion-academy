# Instructor guide: Model workflow state

Objective: O5: Defend a applied AI analysis portfolio with reproducible evidence and limitations.

Timing: 10-minute setup, 20-minute implementation, 20-minute challenge, 15-minute critique, 5-minute wrap-up.

Emphasize: Detect the prior result and avoid repeating it

Common mistake: Perform it twice to be certain. Ask which assumption failed.

Worked interpretation: Explicit states make retries and handoffs inspectable. Define legal transitions and terminal states. A retry must detect completed work rather than duplicate an action.

Discussion: post one failure and critique one peer with evidence.

Do not treat a rules simulation as a live model or production service. Review the claim against reproduced outputs.